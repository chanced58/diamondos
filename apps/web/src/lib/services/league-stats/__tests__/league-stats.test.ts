import { leagueComparisonResponseSchema, leagueStatsResponseSchema } from '@baseball/shared';
import { loadLeagueComparison, loadLeagueStats } from '../league-stats';
import { fakeDb } from '../../__tests__/fake-db';

const mockGetLeagueForTeam = jest.fn();
jest.mock('@baseball/database', () => ({ getLeagueForTeam: (...args: unknown[]) => mockGetLeagueForTeam(...args) }));
const mockLoadLeaguePlayerStats = jest.fn();
jest.mock('@/lib/stats/league-stats', () => ({
  loadLeaguePlayerStats: (...args: unknown[]) => mockLoadLeaguePlayerStats(...args),
}));
const mockLoadTeamComparison = jest.fn();
jest.mock('@/lib/stats/team-comparison', () => ({
  loadTeamComparison: (...args: unknown[]) => mockLoadTeamComparison(...args),
}));

const TEAM = '11111111-1111-4111-8111-111111111111';
const member = { 'team_members.select': { data: { role: 'parent' } } };

const batter = {
  playerId: 'b1', playerName: 'Ann Coit (Huskies)', gamesAppeared: 1, plateAppearances: 1, atBats: 0, runs: 0, hits: 0,
  doubles: 0, triples: 0, homeRuns: 0, rbi: 0, walks: 1, strikeouts: 0, hitByPitch: 0, sacrificeFlies: 0,
  sacrificeHits: 0, avg: NaN, obp: 1, slg: NaN, ops: NaN, iso: NaN, babip: NaN, kPct: 0, bbPct: 1, woba: 0.69,
  battedBalls: 0, hardHitBalls: 0, hardHitPct: NaN, qab: 0, qabPct: NaN,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetLeagueForTeam.mockResolvedValue({ id: 'l1', name: 'Metro', slug: 'metro' });
  mockLoadLeaguePlayerStats.mockResolvedValue({ teamCount: 4, gameCount: 30, pitching: [], batting: [batter] });
  mockLoadTeamComparison.mockResolvedValue([
    { teamId: 't1', teamName: 'Huskies', isOpponentTeam: false, gamesPlayed: 2, wins: 2, losses: 0, ties: 0,
      runsScored: 9, runsAllowed: 3, teamAvg: 0.3, teamEra: 1.5, totalHits: 12, totalStrikeouts: 14 },
  ]);
});

describe('loadLeagueStats', () => {
  it('should hide the team from outsiders and reject a bad id', async () => {
    expect(await loadLeagueStats(fakeDb().db, 'stranger', { teamId: TEAM })).toMatchObject({ ok: false, code: 'not_found' });
    expect(await loadLeagueStats(fakeDb(member).db, 'u1', { teamId: 'x' })).toMatchObject({ ok: false, code: 'invalid' });
    expect(mockLoadLeaguePlayerStats).not.toHaveBeenCalled();
  });

  it('should say when the team is not in a league', async () => {
    mockGetLeagueForTeam.mockResolvedValue(null);
    expect(await loadLeagueStats(fakeDb(member).db, 'parent-1', { teamId: TEAM })).toMatchObject({
      ok: false, code: 'not_found', error: 'This team is not in a league.',
    });
  });

  it("should give any member the league's players, with uncomputable rates as null", async () => {
    const { db } = fakeDb(member);
    const result = await loadLeagueStats(db, 'parent-1', { teamId: TEAM });
    if (!result.ok) throw new Error(result.error);

    expect(leagueStatsResponseSchema.parse(result.data)).toEqual(result.data);
    expect(mockLoadLeaguePlayerStats).toHaveBeenCalledWith(db, 'l1');
    expect(result.data).toMatchObject({ league: { id: 'l1', name: 'Metro' }, teamCount: 4, gameCount: 30 });
    expect(result.data.batting[0]).toMatchObject({ avg: null, obp: 1 });
  });

  it('should fail cleanly when the league cannot be read in full', async () => {
    mockLoadLeaguePlayerStats.mockRejectedValue(new Error('players query failed'));
    jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(await loadLeagueStats(fakeDb(member).db, 'parent-1', { teamId: TEAM })).toMatchObject({ ok: false, code: 'failed' });
  });
});

describe('loadLeagueComparison', () => {
  it("should compare the league's teams for any member", async () => {
    const { db } = fakeDb(member);
    const result = await loadLeagueComparison(db, 'parent-1', { teamId: TEAM });
    if (!result.ok) throw new Error(result.error);

    expect(leagueComparisonResponseSchema.parse(result.data)).toEqual(result.data);
    expect(result.data.rows[0]).toMatchObject({ teamName: 'Huskies', wins: 2 });
  });

  it('should fail cleanly when the league lookup throws', async () => {
    mockGetLeagueForTeam.mockRejectedValue(new Error('db down'));
    jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(await loadLeagueComparison(fakeDb(member).db, 'parent-1', { teamId: TEAM })).toMatchObject({ ok: false, code: 'failed' });
  });
});
