/**
 * Every consumer that re-derives runs from the event log must agree on plays
 * whose runners have linked outcomes (BASERUNNER_OUT / BASERUNNER_ADVANCE with
 * relatedEventId → the play). deriveGameState is the reference; the line
 * score, batting / opponent batting / pitching stats and the MaxPreps copy
 * must match it. Spec: docs/superpowers/specs/2026-09-28-shared-runner-
 * advancement-and-sacrifice-outcomes-design.md.
 */
import { deriveGameState } from '../game-state';
import { computeLineScore } from '../line-score';
import { deriveBattingStats } from '../batting-stats';
import { computeOpponentBatting } from '../opponent-batting-stats';
import { derivePitchingStats } from '../pitching-stats';
import type { GameEvent } from '../../types/game-event';

// The MaxPreps export is a Deno edge function outside this package's rootDir
// (it keeps a hand-synced copy of the logic). A runtime require keeps tsc from
// pulling it into this program; jest's transform still compiles it.
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const { aggregateStats } = require('../../../../../supabase/functions/maxpreps-export/stats') as {
  aggregateStats: (events: unknown[]) => Map<string, { r: number; rbi: number }>;
};

type Side = 'ours' | 'theirs';

/** One event carrying both the camelCase and snake_case field names. */
type Row = GameEvent & {
  game_id: string;
  sequence_number: number;
  event_type: string;
  is_top_of_inning: boolean;
};

/** Builds a top-of-1st event log. `side` decides whose batters bat: ours (batterId) or the opponent's. */
function builder(side: Side) {
  let seq = 0;
  const rows: Row[] = [];
  const batterKey = side === 'ours' ? 'batterId' : 'opponentBatterId';
  const pitcherKey = side === 'ours' ? 'opponentPitcherId' : 'pitcherId';

  /** Appends one event and returns its id. */
  function add(type: string, payload: Record<string, unknown>): string {
    const id = `e${seq}`;
    rows.push({
      id,
      gameId: 'g1',
      game_id: 'g1',
      sequenceNumber: seq,
      sequence_number: seq,
      eventType: type,
      event_type: type,
      inning: 1,
      isTopOfInning: true,
      is_top_of_inning: true,
      payload,
      occurredAt: new Date(2026, 0, 1, 12, 0, seq).toISOString(),
      createdBy: 't',
      deviceId: 't',
    } as unknown as Row);
    seq += 1;
    return id;
  }

  add('game_start', { awayLineupPitcherId: 'p1', homeLineupPitcherId: 'p1' });
  return {
    rows,
    /** A pitch in play, then the hit; returns the hit's event id. */
    hit(batter: string, hitType: string, extra: Record<string, unknown> = {}) {
      add('pitch_thrown', { [batterKey]: batter, [pitcherKey]: 'p1', outcome: 'in_play' });
      return add('hit', { [batterKey]: batter, [pitcherKey]: 'p1', hitType, ...extra });
    },
    /** A linked runner outcome on the play `parentId`. */
    linked(type: 'baserunner_out' | 'baserunner_advance', parentId: string, payload: Record<string, unknown>) {
      add(type, { ...payload, [pitcherKey]: 'p1', relatedEventId: parentId, reason: 'on_play' });
    },
    /** A pitch in play, then a sacrifice (the batter is out); returns its event id. */
    sac(batter: string, kind: 'sacrifice_fly' | 'sacrifice_bunt', extra: Record<string, unknown> = {}) {
      add('pitch_thrown', { [batterKey]: batter, [pitcherKey]: 'p1', outcome: 'in_play' });
      return add(kind, { [batterKey]: batter, [pitcherKey]: 'p1', ...extra });
    },
    /** The SCORE that accompanies a linked advance home. */
    score(runnerId: string, parentId: string) {
      add('score', { scoringPlayerId: runnerId, rbis: 0, relatedEventId: parentId });
    },
  };
}

type Scenario = {
  name: string;
  build: (b: ReturnType<typeof builder>) => void;
  runs: number;
  runsBy: Record<string, number>;
  rbiBy: Record<string, number>;
};

const SCENARIOS: Scenario[] = [
  {
    name: 'control: no linked outcomes (double, double)',
    build: (b) => {
      b.hit('a1', 'double');
      b.hit('a2', 'double');
    },
    runs: 1,
    runsBy: { a1: 1, a2: 0 },
    rbiBy: { a1: 0, a2: 1 },
  },
  {
    name: 'A: runner from 2nd held at 3rd on a double, then a single scores him',
    build: (b) => {
      b.hit('a1', 'double');
      const hit = b.hit('a2', 'double');
      b.linked('baserunner_advance', hit, { runnerId: 'a1', fromBase: 2, toBase: 3 });
      b.hit('a3', 'single');
    },
    runs: 1,
    runsBy: { a1: 1, a2: 0, a3: 0 },
    rbiBy: { a1: 0, a2: 0, a3: 1 },
  },
  {
    name: 'B: runner from 2nd advanced home on a single; the next single scores nobody',
    build: (b) => {
      b.hit('a1', 'double');
      const hit = b.hit('a2', 'single', { rbis: 1 });
      b.linked('baserunner_advance', hit, { runnerId: 'a1', fromBase: 2, toBase: 4 });
      b.score('a1', hit);
      b.hit('a3', 'single');
    },
    runs: 1,
    runsBy: { a1: 1, a2: 0, a3: 0 },
    rbiBy: { a1: 0, a2: 1, a3: 0 },
  },
  {
    name: 'C: runner from 1st thrown out on a triple',
    build: (b) => {
      b.hit('a1', 'single');
      const hit = b.hit('a2', 'triple');
      b.linked('baserunner_out', hit, { runnerId: 'a1', fromBase: 1 });
    },
    runs: 0,
    runsBy: { a1: 0, a2: 0 },
    rbiBy: { a1: 0, a2: 0 },
  },
  {
    name: 'D: two runners share an id; the one from 1st is thrown out, the one from 2nd scores later',
    build: (b) => {
      b.hit('a1', 'single');
      b.hit('a1', 'single'); // no batting order: the same batter credited twice
      const hit = b.hit('a2', 'single');
      b.linked('baserunner_out', hit, { runnerId: 'a1', fromBase: 1 });
      b.hit('a3', 'single');
    },
    runs: 1,
    runsBy: { a1: 1, a2: 0, a3: 0 },
    rbiBy: { a1: 0, a2: 0, a3: 1 },
  },
  {
    name: 'E: sac bunt — runner from 1st holds, runner from 2nd moves up; a single then scores him',
    build: (b) => {
      b.hit('a1', 'single');
      b.hit('a2', 'single'); // a1 → 2nd, a2 on 1st
      const bunt = b.sac('a3', 'sacrifice_bunt');
      b.linked('baserunner_advance', bunt, { runnerId: 'a2', fromBase: 1, toBase: 1 });
      b.hit('a4', 'single'); // a1 scores from 3rd; a2 → 2nd
      b.hit('a5', 'double'); // a2 scores once (a stray copy of him would score twice)
    },
    runs: 2,
    runsBy: { a1: 1, a2: 1, a3: 0, a4: 0, a5: 0 },
    rbiBy: { a1: 0, a2: 0, a3: 0, a4: 1, a5: 1 },
  },
  {
    name: 'G: sac bunt — runner from 3rd holds (no squeeze) while the runner from 1st moves up',
    build: (b) => {
      b.hit('a1', 'double');
      b.hit('a2', 'single'); // a1 → 3rd, a2 on 1st
      const bunt = b.sac('a3', 'sacrifice_bunt');
      b.linked('baserunner_advance', bunt, { runnerId: 'a1', fromBase: 3, toBase: 3 });
      b.hit('a4', 'single'); // a1 scores now
    },
    runs: 1,
    runsBy: { a1: 1, a2: 0, a3: 0, a4: 0 },
    rbiBy: { a1: 0, a2: 0, a3: 0, a4: 1 },
  },
  {
    name: 'F: sac fly — runner from 3rd scores and the runner from 2nd tags to 3rd; a single scores him',
    build: (b) => {
      b.hit('a1', 'double');
      const hit = b.hit('a2', 'double');
      b.linked('baserunner_advance', hit, { runnerId: 'a1', fromBase: 2, toBase: 3 }); // a1 3rd, a2 2nd
      const fly = b.sac('a3', 'sacrifice_fly', { rbis: 1 });
      b.linked('baserunner_advance', fly, { runnerId: 'a2', fromBase: 2, toBase: 3 });
      b.hit('a4', 'single'); // a2 scores from 3rd
    },
    runs: 2,
    runsBy: { a1: 1, a2: 1, a3: 0, a4: 0 },
    rbiBy: { a1: 0, a2: 0, a3: 1, a4: 1 },
  },
];

const PLAYERS = ['a1', 'a2', 'a3', 'a4', 'a5', 'p1'].map((id) => ({ id, firstName: id, lastName: 'X' }));
const OPP_NAMES = new Map(['a1', 'a2', 'a3', 'a4', 'a5'].map((id) => [id, id]));

describe.each(SCENARIOS)('runner outcomes stay consistent — $name', ({ build, runs, runsBy, rbiBy }) => {
  const ours = builder('ours');
  build(ours);
  const theirs = builder('theirs');
  build(theirs);

  it('deriveGameState (reference)', () => {
    expect(deriveGameState('g1', ours.rows, 'home').awayScore).toBe(runs);
  });

  it('computeLineScore', () => {
    const line = computeLineScore(ours.rows as unknown as Record<string, unknown>[]);
    expect(line.awayRuns).toBe(runs);
  });

  it('deriveBattingStats', () => {
    const stats = deriveBattingStats(ours.rows, PLAYERS);
    for (const [id, r] of Object.entries(runsBy)) expect([id, stats.get(id)?.runs ?? 0]).toEqual([id, r]);
    for (const [id, rbi] of Object.entries(rbiBy)) expect([id, stats.get(id)?.rbi ?? 0]).toEqual([id, rbi]);
  });

  it('computeOpponentBatting', () => {
    const rows = computeOpponentBatting(theirs.rows as unknown as Record<string, unknown>[], OPP_NAMES);
    const byId = new Map(rows.map((row) => [row.playerId, row]));
    for (const [id, r] of Object.entries(runsBy)) expect([id, byId.get(id)?.r ?? 0]).toEqual([id, r]);
    for (const [id, rbi] of Object.entries(rbiBy)) expect([id, byId.get(id)?.rbi ?? 0]).toEqual([id, rbi]);
  });

  it('derivePitchingStats', () => {
    const stats = derivePitchingStats(theirs.rows, PLAYERS);
    expect(stats.get('p1')?.runsAllowed ?? 0).toBe(runs);
  });

  it('MaxPreps export copy', () => {
    const stats = aggregateStats(ours.rows as never);
    for (const [id, r] of Object.entries(runsBy)) expect([id, stats.get(id)?.r ?? 0]).toEqual([id, r]);
    for (const [id, rbi] of Object.entries(rbiBy)) expect([id, stats.get(id)?.rbi ?? 0]).toEqual([id, rbi]);
  });
});

describe('computeOpponentBatting — a held runner missing from the name map', () => {
  it('should keep him on base so the next batter is credited when he scores', () => {
    const b = builder('theirs');
    b.hit('ghost', 'double'); // a runner the opponent roster doesn't name
    const hit = b.hit('a2', 'double');
    b.linked('baserunner_advance', hit, { runnerId: 'ghost', fromBase: 2, toBase: 3 });
    b.hit('a3', 'single');
    const rows = computeOpponentBatting(b.rows as unknown as Record<string, unknown>[], OPP_NAMES);
    expect(rows.find((row) => row.playerId === 'a3')?.rbi).toBe(1);
  });
});
