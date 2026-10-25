import { SubscriptionTier, tournamentDetailResponseSchema } from '@baseball/shared';
import { loadTournament } from '../load-tournament';
import { fakeDb } from '../../__tests__/fake-db';

const mockStats = jest.fn();
jest.mock('@/lib/tournament-player-stats', () => ({ loadTournamentPlayerStats: (...args: unknown[]) => mockStats(...args) }));
const mockResolveTeamTier = jest.fn();
jest.mock('@/lib/team-tier', () => ({ resolveTeamTier: (...args: unknown[]) => mockResolveTeamTier(...args) }));

const TOURNAMENT = '11111111-1111-4111-8111-111111111111';
const TEAM = '22222222-2222-4222-8222-222222222222';
const SEASON = '33333333-3333-4333-8333-333333333333';

const batter = {
  playerId: 'b1', playerName: 'Ann Coit', gamesAppeared: 1, plateAppearances: 1, atBats: 0, runs: 0, hits: 0,
  doubles: 0, triples: 0, homeRuns: 0, rbi: 0, walks: 1, strikeouts: 0, hitByPitch: 0, sacrificeFlies: 0,
  sacrificeHits: 0, avg: NaN, obp: 1, slg: NaN, ops: NaN, iso: NaN, babip: NaN, kPct: 0, bbPct: 1, woba: 0.69,
  battedBalls: 0, hardHitBalls: 0, hardHitPct: NaN, qab: 1, qabPct: 1,
};

const tournamentRow = {
  data: {
    id: TOURNAMENT,
    name: 'Fall Classic',
    start_date: '2026-10-30',
    end_date: '2026-11-01',
    status: 'active',
    scoring_settings: { lineup: { allowExpanded: true, maxBatters: 12, allowMidGameExtension: true, allowMidGameContraction: false } },
    tournament_teams: [{ team_id: TEAM, season_id: SEASON, teams: { name: 'Idaho Natives', level: 'youth' } }],
  },
};
const games = { data: [{ id: 'g1', opponent_name: 'Eagles', scheduled_at: '2026-10-30T16:00:00Z', time_zone: 'America/Boise', status: 'scheduled' }] };

function tournamentDb(role: string | null) {
  return fakeDb({
    'tournaments.select': tournamentRow,
    'user_profiles.select': { data: { is_platform_admin: false } },
    'team_members.select': { data: role ? { role } : null },
    'games.select': games,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockResolveTeamTier.mockResolvedValue(SubscriptionTier.PRO);
  mockStats.mockResolvedValue({ scoredGameCount: 1, batting: [batter], pitching: [] });
});

describe('loadTournament', () => {
  it("should show a team member the tournament, its games and the team's stats", async () => {
    const { db, calls } = tournamentDb('parent');
    const result = await loadTournament(db, 'parent', { tournamentId: TOURNAMENT });
    if (!result.ok) throw new Error(result.error);
    const data = tournamentDetailResponseSchema.parse(result.data);

    expect(data).toMatchObject({
      tournament: { name: 'Fall Classic', startDate: '2026-10-30', endDate: '2026-11-01' },
      team: { id: TEAM, name: 'Idaho Natives' },
      lineupRules: { allowExpanded: true, maxBatters: 12, allowMidGameExtension: true, allowMidGameContraction: false },
      games: [{ id: 'g1', opponentName: 'Eagles', timeZone: 'America/Boise' }],
      scoredGameCount: 1,
      defaultTier: 'youth',
      canAddGame: false,
    });
    // Rates that can't be computed travel as null.
    expect(data.batting[0]).toMatchObject({ avg: null, obp: 1 });
    // Only the tournament team's games, and stats scoped to the tournament's season.
    expect(calls.find((c) => c.table === 'games')?.filters).toMatchObject({ tournament_id: TOURNAMENT, team_id: TEAM });
    expect(mockStats).toHaveBeenCalledWith(db, { tournamentId: TOURNAMENT, teamId: TEAM, seasonId: SEASON });
  });

  it('should let a coach of the team add games', async () => {
    const result = await loadTournament(tournamentDb('head_coach').db, 'coach', { tournamentId: TOURNAMENT });
    expect(result).toMatchObject({ ok: true, data: { canAddGame: true } });
  });

  it("should hide a tournament from someone who isn't on its team, before reading stats", async () => {
    expect(await loadTournament(tournamentDb(null).db, 'x', { tournamentId: TOURNAMENT })).toMatchObject({ ok: false, code: 'not_found' });
    expect(await loadTournament(fakeDb({ 'tournaments.select': { data: null } }).db, 'x', { tournamentId: TOURNAMENT })).toMatchObject({
      ok: false,
      code: 'not_found',
    });
    expect(mockStats).not.toHaveBeenCalled();
  });

  it("should hide a failure's detail", async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockStats.mockRejectedValue(new Error('events query failed'));
    expect(await loadTournament(tournamentDb('parent').db, 'parent', { tournamentId: TOURNAMENT })).toEqual({
      ok: false,
      code: 'failed',
      error: 'Something went wrong. Please try again.',
    });
  });
});
