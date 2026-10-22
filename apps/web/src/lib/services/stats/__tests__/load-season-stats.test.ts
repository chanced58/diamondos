import { seasonStatsResponseSchema, SubscriptionTier } from '@baseball/shared';
import { loadSeasonStats } from '../load-season-stats';
import { fakeDb } from '../../__tests__/fake-db';
import type { TeamSeasonStats } from '@/lib/stats/load-season-stats';

const mockLoadTeamSeasonStats = jest.fn();
jest.mock('@/lib/stats/load-season-stats', () => ({
  loadTeamSeasonStats: (...args: unknown[]) => mockLoadTeamSeasonStats(...args),
}));
const mockResolveTeamTier = jest.fn();
jest.mock('@/lib/team-tier', () => ({
  resolveTeamTier: (...args: unknown[]) => mockResolveTeamTier(...args),
}));
const mockGetLeagueForTeam = jest.fn();
jest.mock('@baseball/database', () => ({
  getLeagueForTeam: (...args: unknown[]) => mockGetLeagueForTeam(...args),
}));

const TEAM = '11111111-1111-4111-8111-111111111111';
const SEASON = '22222222-2222-4222-8222-222222222222';

const pitcher = {
  playerId: 'p1', playerName: 'Luke Fox', gamesAppeared: 1, inningsPitchedOuts: 0, totalPitches: 4, strikes: 2,
  balls: 2, strikePercentage: 0.5, firstPitchStrikes: 1, firstPitchStrikePercentage: 1, threeBallCountPAs: 0,
  threeZeroCountPAs: 0, totalPAs: 1, threeBallCountPercentage: 0, threeZeroCountPercentage: 0, hitsAllowed: 1,
  runsAllowed: 1, earnedRunsAllowed: 1, walksAllowed: 0, strikeouts: 0, hitBatters: 0, wildPitches: 0,
  era: Infinity, whip: Infinity, strikeoutsPerSeven: Infinity, walksPerSeven: NaN,
  baByCount: { '0-0': { atBats: 0, hits: 0, average: NaN }, '1-1': { atBats: 1, hits: 1, average: 1 } },
};

const batter = {
  playerId: 'b1', playerName: 'Ann Coit', gamesAppeared: 1, plateAppearances: 1, atBats: 0, runs: 0, hits: 0,
  doubles: 0, triples: 0, homeRuns: 0, rbi: 0, walks: 1, strikeouts: 0, hitByPitch: 0, sacrificeFlies: 0,
  sacrificeHits: 0, avg: NaN, obp: 1, slg: NaN, ops: NaN, iso: NaN, babip: NaN, kPct: 0, bbPct: 1, woba: 0.69,
  battedBalls: 0, hardHitBalls: 0, hardHitPct: NaN, qab: 1, qabPct: 1,
};

const stats: TeamSeasonStats = {
  seasons: [{ id: SEASON, name: 'Spring', isActive: true }],
  season: { id: SEASON, name: 'Spring' },
  gameCount: 3,
  defaultTier: 'high_school',
  pitching: [pitcher],
  batting: [batter],
  complianceMap: {
    p1: {
      pitchCount: 40, requiredRestDays: 1, canPitchNextDay: false, lastGameDate: '2026-10-20', timeZone: 'America/Phoenix', pitches7d: 55,
    },
  },
  catcher: [{ playerId: 'c1', playerName: 'Cal Baldwin', totalInnings: 5.5, games: 2, lastGameDate: '2026-10-20' }],
  opponents: [{
    teamId: 'o1', teamName: 'Eagles', gamesPlayed: 1, wins: 1, losses: 0, ties: 0,
    batting: [{ playerId: 'x', playerName: 'X', pa: 1, ab: 1, r: 0, h: 0, doubles: 0, triples: 0, hr: 0, rbi: 0,
      bb: 0, k: 1, hbp: 0, sf: 0, sh: 0, sb: 0, cs: 0, avg: 0, obp: 0, slg: 0, ops: 0 }],
    pitching: [pitcher],
  }],
  missingWaiverCount: 2,
};

const member = (role: string) => ({ 'team_members.select': { data: { role } } });

beforeEach(() => {
  jest.clearAllMocks();
  mockLoadTeamSeasonStats.mockResolvedValue(stats);
  mockResolveTeamTier.mockResolvedValue(SubscriptionTier.PRO);
  mockGetLeagueForTeam.mockResolvedValue(null);
});

describe('loadSeasonStats', () => {
  it('should reject a malformed team or season id', async () => {
    const { db } = fakeDb(member('player'));
    expect(await loadSeasonStats(db, 'u1', { teamId: 'nope' })).toMatchObject({ ok: false, code: 'invalid' });
    expect(await loadSeasonStats(db, 'u1', { teamId: TEAM, seasonId: 'x' })).toMatchObject({ ok: false, code: 'invalid' });
  });

  it('should hide a team from someone outside it without loading stats', async () => {
    const { db } = fakeDb();
    expect(await loadSeasonStats(db, 'stranger', { teamId: TEAM })).toMatchObject({ ok: false, code: 'not_found' });
    expect(mockLoadTeamSeasonStats).not.toHaveBeenCalled();
  });

  it('should give a team member every tab, with rates that cannot be computed sent as null', async () => {
    const { db } = fakeDb(member('parent'));
    const result = await loadSeasonStats(db, 'parent-1', { teamId: TEAM, seasonId: SEASON });
    if (!result.ok) throw new Error(result.error);

    expect(seasonStatsResponseSchema.parse(result.data)).toEqual(result.data);
    expect(mockLoadTeamSeasonStats).toHaveBeenCalledWith(db, TEAM, {
      seasonId: SEASON, includeCatcher: true, includeOpponents: true,
    });
    const [p] = result.data.pitching;
    expect(p).toMatchObject({ era: null, walksPerSeven: null, strikePercentage: 0.5 });
    expect(p.baByCount['0-0'].average).toBeNull();
    expect(p.baByCount['1-1'].average).toBe(1);
    expect(p.compliance).toMatchObject({ requiredRestDays: 1, pitches7d: 55 });
    expect(result.data.batting[0]).toMatchObject({ avg: null, obp: 1, qabPct: 1 });
    expect(result.data.opponents?.[0].pitching[0].era).toBeNull();
    expect(result.data.features).toEqual({ advancedBatting: true, advancedPitching: true, opponents: true });
    expect(result.data.missingWaiverCount).toBe(2);
  });

  it('should leave out opponents on a plan without opponent tracking', async () => {
    mockResolveTeamTier.mockResolvedValue(SubscriptionTier.STARTER);
    const { db } = fakeDb(member('head_coach'));
    const result = await loadSeasonStats(db, 'coach-1', { teamId: TEAM });
    if (!result.ok) throw new Error(result.error);

    expect(result.data.opponents).toBeNull();
    expect(result.data.features).toEqual({ advancedBatting: true, advancedPitching: true, opponents: false });
    expect(mockLoadTeamSeasonStats).toHaveBeenCalledWith(db, TEAM, expect.objectContaining({ includeOpponents: false }));
  });

  it('should say whether the team plays in a league', async () => {
    mockGetLeagueForTeam.mockResolvedValue({ id: 'l1', name: 'Metro' });
    const { db } = fakeDb(member('player'));
    const result = await loadSeasonStats(db, 'player-1', { teamId: TEAM });
    expect(result.ok && result.data.hasLeague).toBe(true);
  });

  it('should fail cleanly when the season cannot be read in full', async () => {
    mockLoadTeamSeasonStats.mockRejectedValue(new Error('page limit'));
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const { db } = fakeDb(member('player'));
    expect(await loadSeasonStats(db, 'player-1', { teamId: TEAM })).toMatchObject({ ok: false, code: 'failed' });
  });
});
