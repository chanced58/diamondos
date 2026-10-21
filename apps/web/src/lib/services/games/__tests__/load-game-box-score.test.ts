import { gameBoxScoreResponseSchema } from '@baseball/shared';
import { loadGameBoxScore, toBoxScore } from '../load-game-box-score';
import { fakeDb } from '../../__tests__/fake-db';
import type { GameStatsBundle } from '@/lib/game-stats/load-game-stats';

const mockLoadGameStats = jest.fn();
jest.mock('@/lib/game-stats/load-game-stats', () => ({
  loadGameStats: (...args: unknown[]) => mockLoadGameStats(...args),
}));

const GAME = '11111111-1111-4111-8111-111111111111';

function batter(id: string, pa: number, avg: number) {
  return {
    playerId: id, playerName: `P ${id}`, plateAppearances: pa, atBats: pa, runs: 1, hits: 1, doubles: 0,
    triples: 0, homeRuns: 0, rbi: 1, walks: 0, strikeouts: 0, avg,
  };
}

function pitcherRow(id: string, outs: number, era: number) {
  return {
    playerId: id, playerName: `P ${id}`, totalPAs: 10, inningsPitchedOuts: outs, hitsAllowed: 2, runsAllowed: 1,
    earnedRunsAllowed: 1, walksAllowed: 1, strikeouts: 3, hitBatters: 0, wildPitches: 0, totalPitches: 40,
    strikePercentage: 0.6, threeZeroCountPAs: 1, era,
  };
}

const bundle = {
  game: { id: GAME, status: 'completed', opponentName: 'Eagles' },
  teamName: 'Huskies',
  isHome: false,
  lineScore: {
    awayRunsByInning: [1, 0, 2], homeRunsByInning: [0, 0, 1],
    awayRuns: 3, homeRuns: 1, awayHits: 6, homeHits: 4, awayErrors: 0, homeErrors: 2,
  },
  ourBatting: [batter('a', 2, 0.5), batter('b', 4, NaN)],
  oppBatting: [{ playerId: 'x', playerName: 'X', pa: 3, ab: 3, r: 0, h: 1, doubles: 0, triples: 0, hr: 0, rbi: 0, bb: 0, k: 1, hbp: 0, sf: 0, sh: 0, sb: 2, cs: 0, avg: 1 / 3, obp: 0, slg: 0, ops: 0 }],
  ourPitching: [pitcherRow('p1', 3, 3), pitcherRow('p2', 9, Infinity)],
  oppPitching: [],
  ourFielding: [
    { playerId: 'a', playerName: 'A', position: 'SS', putouts: 1, assists: 0, errors: 0 },
    { playerId: 'b', playerName: 'B', position: '1B', putouts: 5, assists: 1, errors: 1 },
  ],
  oppFielding: [],
  baserunning: { b: { sb: 2, cs: 0 } },
} as unknown as GameStatsBundle;

beforeEach(() => {
  jest.clearAllMocks();
  mockLoadGameStats.mockResolvedValue(bundle);
});

describe('loadGameBoxScore', () => {
  const member = { 'team_members.select': { data: { role: 'parent' } } };

  it('should hide the game from someone outside its team', async () => {
    const { db } = fakeDb({ 'games.select': { data: { team_id: 't1', status: 'completed' } } });
    expect(await loadGameBoxScore(db, 'stranger', { gameId: GAME })).toMatchObject({ ok: false, code: 'not_found' });
    expect(mockLoadGameStats).not.toHaveBeenCalled();
  });

  it('should refuse a game that has not started without deriving stats', async () => {
    const { db } = fakeDb({ 'games.select': { data: { team_id: 't1', status: 'scheduled' } }, ...member });
    expect(await loadGameBoxScore(db, 'parent-1', { gameId: GAME })).toMatchObject({ ok: false, code: 'conflict' });
    expect(mockLoadGameStats).not.toHaveBeenCalled();
  });

  it('should give any team member the box score, but only coaches the export', async () => {
    const parent = fakeDb({ 'games.select': { data: { team_id: 't1', status: 'completed' } }, ...member });
    const parentResult = await loadGameBoxScore(parent.db, 'parent-1', { gameId: GAME });
    if (!parentResult.ok) throw new Error(parentResult.error);
    expect(parentResult.data.canExport).toBe(false);

    const coach = fakeDb({
      'games.select': { data: { team_id: 't1', status: 'completed' } },
      'team_members.select': { data: { role: 'head_coach' } },
    });
    const coachResult = await loadGameBoxScore(coach.db, 'coach-1', { gameId: GAME });
    if (!coachResult.ok) throw new Error(coachResult.error);
    expect(coachResult.data.canExport).toBe(true);
  });
});

describe('toBoxScore', () => {
  const box = toBoxScore(bundle, true);

  it('should match the mobile contract, with NaN and infinite rates as null', () => {
    expect(() => gameBoxScoreResponseSchema.parse(box)).not.toThrow();
    expect(box.us.batting.find((b) => b.playerId === 'b')?.avg).toBeNull();
    expect(box.us.pitching.find((p) => p.playerId === 'p2')?.era).toBeNull();
  });

  it('should put us on the away line when we batted first', () => {
    expect(box.weAreHome).toBe(false);
    expect(box.us).toMatchObject({ name: 'Huskies', runsByInning: [1, 0, 2], r: 3, h: 6, e: 0 });
    expect(box.them).toMatchObject({ name: 'Eagles', runsByInning: [0, 0, 1], r: 1, h: 4, e: 2 });
  });

  it('should sort batters, pitchers and fielders as the web page does and carry steals', () => {
    expect(box.us.batting.map((b) => b.playerId)).toEqual(['b', 'a']);
    expect(box.us.batting[0].sb).toBe(2);
    expect(box.us.batting[1].sb).toBe(0);
    expect(box.us.pitching.map((p) => p.playerId)).toEqual(['p2', 'p1']);
    expect(box.us.fielding.map((f) => f.playerId)).toEqual(['b', 'a']);
    expect(box.them.batting[0]).toMatchObject({ name: 'X', sb: 2 });
  });
});
