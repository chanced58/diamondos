import { leagueHomeResponseSchema, leagueTeamResponseSchema, getStatDef, mergeWithThemeDefaults } from '@baseball/shared';
import { loadLeagueHome } from '../load-league-home';
import { loadLeagueTeam } from '../load-league-team';
import { fakeDb } from '../../__tests__/fake-db';

const mockHome = jest.fn();
jest.mock('@/lib/league-home/load', () => ({ getLeagueHomeData: (...args: unknown[]) => mockHome(...args) }));
const mockTeam = jest.fn();
jest.mock('@/lib/league-home/team-load', () => ({
  ...jest.requireActual('@/lib/league-home/team-load'),
  getTeamStatPageData: (...args: unknown[]) => mockTeam(...args),
}));
jest.mock('server-only', () => ({}));

const TEAM = '11111111-1111-4111-8111-111111111111';
const RIVAL = '22222222-2222-4222-8222-222222222222';

const standing = (teamId: string | null, name: string, extra = {}) => ({
  team_id: teamId, opponent_team_id: null, division_id: null, team_name: name,
  wins: 3, losses: 1, ties: 0, win_pct: 0.75, runs_for: 20, runs_against: 10, ...extra,
});
const board = (key: 'avg' | 'teamEra' | 'qabPct', rows: Array<Record<string, unknown>>, label?: string) => ({
  def: getStatDef(key),
  label: label ?? getStatDef(key).label,
  rows: rows.map((r) => ({ rank: 1, qualifierValue: 1, prevRank: null, ours: false, ...r })),
});

function homeData(theme: unknown = {}) {
  return {
    ok: true,
    league: { id: 'l1', name: 'Idaho 2A', logoUrl: null, visibility: 'public' },
    theme: mergeWithThemeDefaults(theme),
    season: '2026',
    seasons: ['2026', '2025'],
    standings: [standing(TEAM, 'Huskies'), standing(null, 'Eagles', { wins: 0, win_pct: 0 })],
    divisions: [{ id: 'd1', name: 'North', rows: [standing(TEAM, 'Huskies')] }],
    defaultBoards: {
      batting: [board('avg', [{ id: 'p1', name: 'Ann Coit', teamName: 'Huskies', teamId: TEAM, value: 0.4129, ours: true }])],
      pitching: [],
      team: [board('teamEra', [{ id: RIVAL, name: 'Rams', teamId: RIVAL, value: 2.5 }])],
      special: [board('qabPct', [{ id: 'p2', name: 'Bo Ray', teamName: 'Rams', teamId: RIVAL, value: 0.5 }])],
    },
    customBoards: [board('avg', [{ id: 'p3', name: 'Cy Lee', teamName: 'Rams', teamId: RIVAL, value: 0.3 }], 'Rookie AVG')],
    spotlights: [
      { type: 'player_of_week', subject_id: 'p1', subject_name: 'Ann Coit', team_name: 'Huskies', blurb: '9 for 12' },
      { type: 'hot_team', subject_id: RIVAL, subject_name: 'Rams', team_name: null, blurb: 'Won 5 straight' },
    ],
    recent: [{ id: 'g1', team: 'Huskies', team_id: TEAM, opponent: 'Rams', ourScore: 5, theirScore: 2, result: 'W' }],
    upcoming: [{ id: 'g2', label: 'Huskies vs Rams — Nov 1' }],
    counters: { teams: 2, games: 2 },
    updatedAt: '2026-10-25T12:00:00Z',
  };
}

beforeEach(() => jest.clearAllMocks());

describe('loadLeagueHome', () => {
  it('should map the league home for a signed-in viewer, marking their own team', async () => {
    mockHome.mockResolvedValue(homeData());
    const { db } = fakeDb({
      'user_profiles.select': { data: { is_platform_admin: false } },
      'team_members.select': { data: { role: 'parent' } },
      'teams.select': { data: { name: 'Huskies' } },
    });
    const result = await loadLeagueHome(db, 'u1', { slug: 'idaho-2a', season: '2026', teamId: TEAM });
    if (!result.ok) throw new Error(result.error);
    const data = leagueHomeResponseSchema.parse(result.data);

    expect(mockHome).toHaveBeenCalledWith('idaho-2a', true, '2026', { id: TEAM, name: 'Huskies' });
    expect(data.sections).toEqual(['hero', 'standings', 'leaders', 'recent', 'spotlights']);
    expect(data.standings[1]).toEqual(expect.objectContaining({ teamId: null, name: 'Eagles' }));
    expect(data.leaders.batting[0].rows[0]).toEqual(expect.objectContaining({ display: '.413', teamName: 'Huskies', ours: true }));
    // A team board carries no team name; values are formatted per the stat.
    expect(data.leaders.team[0].rows[0]).toEqual(expect.objectContaining({ display: '2.50', teamName: null }));
    // Custom boards sit under Special when the league shows them.
    expect(data.leaders.special.map((b) => b.label)).toEqual(['QAB%', 'Rookie AVG']);
    expect(data.spotlights).toEqual([
      expect.objectContaining({ kind: 'player', subjectTeamId: null, teamId: TEAM }),
      expect.objectContaining({ kind: 'team', subjectTeamId: RIVAL, teamId: null }),
    ]);
  });

  it("should leave out custom boards the league hides, and not mark a team the viewer isn't on", async () => {
    mockHome.mockResolvedValue(homeData({ sections: [{ id: 'customLeaders', enabled: false }] }));
    const { db } = fakeDb({ 'user_profiles.select': { data: { is_platform_admin: false } }, 'team_members.select': { data: null } });
    const result = await loadLeagueHome(db, 'u1', { slug: 'idaho-2a', teamId: TEAM });
    if (!result.ok) throw new Error(result.error);
    expect(result.data.leaders.special.map((b) => b.label)).toEqual(['QAB%']);
    expect(mockHome).toHaveBeenCalledWith('idaho-2a', true, undefined, null);
  });

  it('should answer not found for an unknown league and hide a failure', async () => {
    mockHome.mockResolvedValue({ notFound: true });
    expect(await loadLeagueHome(fakeDb().db, 'u1', { slug: 'nope' })).toMatchObject({ ok: false, code: 'not_found' });

    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockHome.mockRejectedValue(new Error('Failed to load league data.'));
    expect(await loadLeagueHome(fakeDb().db, 'u1', { slug: 'idaho-2a' })).toEqual({ ok: false, code: 'failed', error: 'Something went wrong. Please try again.' });
  });
});

describe('loadLeagueTeam', () => {
  const player = (id: string, extra = {}) => ({
    playerId: id, name: id, optedOut: false, pitched: false, plateAppearances: 10, inningsPitchedOuts: 0,
    stats: { batting: { avg: 0.3 } }, ...extra,
  });

  it('should send formatted cells with their sort values, and only pitchers in pitching', async () => {
    mockTeam.mockResolvedValue({
      ok: true,
      slug: 'idaho-2a',
      league: { id: 'l1', name: 'Idaho 2A' },
      theme: mergeWithThemeDefaults({}),
      season: '2026',
      team: { id: TEAM, name: 'Huskies', logoUrl: null },
      record: { wins: 3, losses: 1, ties: 0, winPct: 0.75, runsFor: 20, runsAgainst: 10 },
      rank: { rank: 1, total: 6 },
      divisionName: 'North',
      teamStats: [{ key: 'teamAvg', label: 'Team AVG', display: '.300' }],
      players: [player('Ann'), player('Bo', { pitched: true, inningsPitchedOuts: 19 }), player('Hid', { optedOut: true, plateAppearances: null, stats: null })],
    });
    const result = await loadLeagueTeam(fakeDb().db, 'u1', { slug: 'idaho-2a', teamId: TEAM });
    if (!result.ok) throw new Error(result.error);
    const data = leagueTeamResponseSchema.parse(result.data);

    expect(mockTeam).toHaveBeenCalledWith('idaho-2a', TEAM, true, undefined);
    expect(data.batting.columns[0]).toEqual({ key: 'pa', label: 'PA', sortDir: 'desc' });
    expect(data.batting.rows[0].cells.pa).toEqual({ value: 10, display: '10' });
    expect(data.batting.rows[2]).toEqual(expect.objectContaining({ optedOut: true, cells: expect.objectContaining({ pa: { value: null, display: '—' } }) }));
    expect(data.pitching.rows.map((r) => r.playerId)).toEqual(['Bo']);
    expect(data.pitching.rows[0].cells.ip).toEqual({ value: 19, display: '6.1' });
  });

  it("should answer not found for a team the league doesn't have", async () => {
    mockTeam.mockResolvedValue({ notFound: true });
    expect(await loadLeagueTeam(fakeDb().db, 'u1', { slug: 'idaho-2a', teamId: TEAM })).toMatchObject({ ok: false, code: 'not_found' });
    expect(await loadLeagueTeam(fakeDb().db, 'u1', { slug: 'idaho-2a', teamId: 'nope' })).toMatchObject({ ok: false, code: 'invalid' });
  });
});
