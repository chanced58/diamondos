import { leaguePageResponseSchema } from '@baseball/shared';
import type { LeagueMember } from '@baseball/database';
import { buildStandings, overallRank, type CompletedGame } from '../league-standings';
import { loadLeaguePage } from '../load-league-page';
import { fakeDb, type FakeCall } from '../../__tests__/fake-db';

const mockLeagueForTeam = jest.fn();
const mockLeagueTeams = jest.fn();
const mockDivisions = jest.fn();
const mockStaff = jest.fn();
jest.mock('@baseball/database', () => ({
  getLeagueForTeam: (...args: unknown[]) => mockLeagueForTeam(...args),
  getLeagueTeams: (...args: unknown[]) => mockLeagueTeams(...args),
  getLeagueDivisions: (...args: unknown[]) => mockDivisions(...args),
  getLeagueStaff: (...args: unknown[]) => mockStaff(...args),
}));

const OURS = '11111111-1111-4111-8111-111111111111';
const RIVAL = '22222222-2222-4222-8222-222222222222';
const OPP = 'opp-eagles';

const member = (overrides: Partial<LeagueMember>): LeagueMember =>
  ({ id: 'm', team_id: null, opponent_team_id: null, league_id: 'l1', division_id: null, is_active: true, teams: null, opponent_teams: null, ...overrides }) as LeagueMember;
const teams = [
  member({ id: 'm1', team_id: OURS, division_id: 'north', teams: { id: OURS, name: 'Huskies', organization: 'North Star' } as LeagueMember['teams'] }),
  member({ id: 'm2', team_id: RIVAL, division_id: 'south', teams: { id: RIVAL, name: 'Rams', organization: null } as LeagueMember['teams'] }),
  member({ id: 'm3', opponent_team_id: OPP, opponent_teams: { id: OPP, name: 'Eagles' } as LeagueMember['opponent_teams'] }),
];
const divisions = [
  { id: 'south', league_id: 'l1', name: 'South' },
  { id: 'north', league_id: 'l1', name: 'North' },
];
const game = (id: string, overrides: Partial<CompletedGame>): CompletedGame => ({
  id, team_id: OURS, opponent_team_id: null, home_score: 0, away_score: 0, location_type: 'home', neutral_home_team: null, scheduled_at: '2026-04-01T18:00:00Z', ...overrides,
});

describe('buildStandings', () => {
  // Huskies beat the Eagles at home 5–2 and lost away at the Rams 1–3 (scored 1, Rams' log has it the other way).
  const huskiesWin = game('g1', { opponent_team_id: OPP, home_score: 5, away_score: 2, scheduled_at: '2026-04-01T18:00:00Z' });
  const huskiesLoss = game('g2', { location_type: 'away', home_score: 3, away_score: 1, scheduled_at: '2026-04-03T18:00:00Z' });
  const ramsWin = game('g3', { team_id: RIVAL, home_score: 3, away_score: 1, scheduled_at: '2026-04-03T18:00:00Z' });

  it('should tally each team from its side, opponents from the inverse side, and order divisions', () => {
    const { divisions: result, gamesPlayed } = buildStandings({
      teams,
      divisions,
      platformGames: [huskiesWin, huskiesLoss, ramsWin],
      opponentGames: [huskiesWin],
      activeTeamId: OURS,
    });

    expect(result.map((d) => d.name)).toEqual(['North', 'South', 'Unassigned']);
    // g1 is counted once though it is in both lists.
    expect(gamesPlayed).toBe(3);

    const huskies = result[0].teams[0];
    expect(huskies).toMatchObject({ name: 'Huskies', isActive: true, wins: 1, losses: 1, rf: 6, ra: 5, diff: 1, pct: 0.5, last5: ['W', 'L'] });
    expect(huskies.streak).toEqual({ type: 'L', count: 1 });

    const eagles = result[2].teams[0];
    expect(eagles).toMatchObject({ name: 'Eagles', isOpponent: true, teamId: null, wins: 0, losses: 1, rf: 2, ra: 5 });
  });

  it('should rank the team overall by win percentage', () => {
    const { divisions: result } = buildStandings({ teams, divisions, platformGames: [huskiesLoss, ramsWin], opponentGames: [], activeTeamId: OURS });
    expect(overallRank(result)).toBe(2);
    expect(overallRank([])).toBeNull();
  });

  it("should name a league's only group Teams when it has no divisions", () => {
    const { divisions: result } = buildStandings({ teams: [teams[2]], divisions: [], platformGames: [], opponentGames: [], activeTeamId: OURS });
    expect(result).toEqual([expect.objectContaining({ id: 'none', name: 'Teams' })]);
    expect(result[0].teams[0]).toMatchObject({ pct: 0, gamesPlayed: 0, last5: [], streak: null });
  });
});

describe('loadLeaguePage', () => {
  const gamesBy = (call: FakeCall) => ({
    data: Array.isArray(call.filters.team_id) ? [game('g1', { home_score: 4, away_score: 1 })] : [],
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockLeagueForTeam.mockResolvedValue({ id: 'l1', name: 'Idaho 2A', description: 'Small schools', slug: 'idaho-2a' });
    mockLeagueTeams.mockResolvedValue(teams);
    mockDivisions.mockResolvedValue(divisions);
    mockStaff.mockResolvedValue([
      { id: 's1', role: 'league_admin', user_id: 'admin', user_profiles: { first_name: 'Ada', last_name: 'Ng' } },
      { id: 's2', role: 'league_manager', user_id: 'mgr', user_profiles: null },
    ]);
  });

  it("should show a team member the league's counters, standings and staff", async () => {
    const { db } = fakeDb({
      'user_profiles.select': { data: { is_platform_admin: false } },
      'team_members.select': { data: { role: 'parent' } },
      'leagues.select': { data: { home_theme: null } },
      'games.select': gamesBy as never,
    });
    const result = await loadLeaguePage(db, 'parent', { teamId: OURS });
    if (!result.ok) throw new Error(result.error);
    const data = leaguePageResponseSchema.parse(result.data);

    expect(data.league).toEqual({ id: 'l1', name: 'Idaho 2A', description: 'Small schools', slug: 'idaho-2a' });
    expect(data.counters).toEqual({ teams: 3, divisions: 2, gamesPlayed: 1, yourRank: 1 });
    expect(data.staff).toEqual([
      { id: 's1', name: 'Ada Ng', role: 'league_admin' },
      { id: 's2', name: 'Unknown', role: 'league_manager' },
    ]);
    expect(data.isLeagueAdmin).toBe(false);
  });

  it('should flag a league admin, and treat a team in no league and an outsider as not found', async () => {
    const admin = fakeDb({
      'user_profiles.select': { data: { is_platform_admin: false } },
      'team_members.select': { data: { role: 'head_coach' } },
      'leagues.select': { data: null },
      'games.select': { data: [] },
    });
    expect(await loadLeaguePage(admin.db, 'admin', { teamId: OURS })).toMatchObject({ ok: true, data: { isLeagueAdmin: true } });

    mockLeagueForTeam.mockResolvedValue(null);
    const noLeague = fakeDb({ 'user_profiles.select': { data: { is_platform_admin: false } }, 'team_members.select': { data: { role: 'head_coach' } } });
    expect(await loadLeaguePage(noLeague.db, 'c', { teamId: OURS })).toMatchObject({ ok: false, code: 'not_found' });

    const outsider = fakeDb({ 'user_profiles.select': { data: { is_platform_admin: false } }, 'team_members.select': { data: null } });
    expect(await loadLeaguePage(outsider.db, 'x', { teamId: OURS })).toMatchObject({ ok: false, code: 'not_found' });
    expect(mockLeagueTeams).toHaveBeenCalledTimes(1);
  });

  it("should hide a failure's detail", async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const { db } = fakeDb({
      'user_profiles.select': { data: { is_platform_admin: false } },
      'team_members.select': { data: { role: 'parent' } },
      'leagues.select': { data: null },
      'games.select': { error: { message: 'boom' } },
    });
    expect(await loadLeaguePage(db, 'parent', { teamId: OURS })).toEqual({ ok: false, code: 'failed', error: 'Something went wrong. Please try again.' });
  });
});
