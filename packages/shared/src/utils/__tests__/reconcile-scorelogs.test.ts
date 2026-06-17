import { reconcileScoreLogs, conflictKey } from '../reconcile-scorelogs';
import type { BattingStats } from '../../types/batting';
import type { PitchingStats } from '../../types/pitching';

/**
 * Build a minimal sequence of raw game_event rows for one half-inning of the
 * away team (top of 1st) scoring `runs` via solo home runs, then an inning
 * change. computeLineScore reads `event_type`, `inning`, `is_top_of_inning`,
 * `payload`, and `sequence_number` off each row.
 */
function topFirstHomers(runs: number): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  let seq = 1;
  for (let i = 0; i < runs; i++) {
    rows.push({
      id: `hr-${i}`,
      game_id: 'g',
      sequence_number: seq++,
      event_type: 'hit',
      inning: 1,
      is_top_of_inning: true,
      payload: { hitType: 'home_run' },
    });
  }
  return rows;
}

/** `count` fielding errors in the top of the 1st (charged to the home defense). */
function topFirstErrors(count: number): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  let seq = 1;
  for (let i = 0; i < count; i++) {
    rows.push({
      id: `e-${i}`,
      game_id: 'g',
      sequence_number: seq++,
      event_type: 'field_error',
      inning: 1,
      is_top_of_inning: true,
      payload: {},
    });
  }
  return rows;
}

function makeBatting(partial: Partial<BattingStats> & { playerId: string }): BattingStats {
  return {
    playerName: 'Test',
    gamesAppeared: 1,
    plateAppearances: 0,
    atBats: 0,
    runs: 0,
    hits: 0,
    doubles: 0,
    triples: 0,
    homeRuns: 0,
    rbi: 0,
    walks: 0,
    strikeouts: 0,
    hitByPitch: 0,
    sacrificeFlies: 0,
    sacrificeHits: 0,
    avg: NaN,
    obp: NaN,
    slg: NaN,
    ops: NaN,
    iso: NaN,
    babip: NaN,
    kPct: NaN,
    bbPct: NaN,
    woba: NaN,
    battedBalls: 0,
    hardHitBalls: 0,
    hardHitPct: NaN,
    qab: 0,
    qabPct: NaN,
    ...partial,
  };
}

function makePitching(partial: Partial<PitchingStats> & { playerId: string }): PitchingStats {
  return {
    playerName: 'Test',
    gamesAppeared: 1,
    inningsPitchedOuts: 0,
    totalPitches: 0,
    strikes: 0,
    balls: 0,
    strikePercentage: NaN,
    firstPitchStrikes: 0,
    firstPitchStrikePercentage: NaN,
    threeBallCountPAs: 0,
    threeZeroCountPAs: 0,
    totalPAs: 0,
    threeBallCountPercentage: NaN,
    threeZeroCountPercentage: NaN,
    hitsAllowed: 0,
    runsAllowed: 0,
    earnedRunsAllowed: 0,
    walksAllowed: 0,
    strikeouts: 0,
    hitBatters: 0,
    wildPitches: 0,
    era: Infinity,
    whip: Infinity,
    strikeoutsPerSeven: 0,
    walksPerSeven: 0,
    baByCount: {},
    ...partial,
  };
}

describe('reconcileScoreLogs', () => {
  it('reports no conflicts when both logs agree', () => {
    const events = topFirstHomers(2);
    const r = reconcileScoreLogs({ events }, { events: [...events] });
    expect(r.inAgreement).toBe(true);
    expect(r.conflicts).toHaveLength(0);
  });

  it('flags a final-score difference', () => {
    const r = reconcileScoreLogs({ events: topFirstHomers(3) }, { events: topFirstHomers(2) });
    const finals = r.conflicts.filter((c) => c.kind === 'final_score');
    expect(finals).toContainEqual({ kind: 'final_score', side: 'away', homeLog: 3, awayLog: 2 });
  });

  it('pinpoints which inning diverged', () => {
    const r = reconcileScoreLogs({ events: topFirstHomers(3) }, { events: topFirstHomers(2) });
    const inning = r.conflicts.find((c) => c.kind === 'inning_runs');
    expect(inning).toMatchObject({ kind: 'inning_runs', inning: 1, half: 'top', homeLog: 3, awayLog: 2 });
  });

  it('flags a team_hits difference', () => {
    // 3 vs 2 top-of-1st home runs also diverges on away team hits.
    const r = reconcileScoreLogs({ events: topFirstHomers(3) }, { events: topFirstHomers(2) });
    expect(r.conflicts).toContainEqual({ kind: 'team_hits', side: 'away', homeLog: 3, awayLog: 2 });
  });

  it('flags a team_errors difference', () => {
    const r = reconcileScoreLogs({ events: topFirstErrors(1) }, { events: topFirstErrors(0) });
    expect(r.conflicts).toContainEqual({ kind: 'team_errors', side: 'home', homeLog: 1, awayLog: 0 });
  });

  it('diffs per-player batting counting stats', () => {
    const events = topFirstHomers(1);
    const home = new Map([['p1', makeBatting({ playerId: 'p1', hits: 2 })]]);
    const away = new Map([['p1', makeBatting({ playerId: 'p1', hits: 1 })]]);
    const r = reconcileScoreLogs({ events, batting: home }, { events, batting: away });
    expect(r.conflicts).toContainEqual({
      kind: 'player_batting',
      playerId: 'p1',
      stat: 'hits',
      homeLog: 2,
      awayLog: 1,
    });
  });

  it('produces a stable key independent of conflict array position', () => {
    // Same logical conflict regardless of surrounding conflicts → same key.
    const a = reconcileScoreLogs({ events: topFirstHomers(3) }, { events: topFirstHomers(2) });
    const b = reconcileScoreLogs({ events: topFirstHomers(5) }, { events: topFirstHomers(2) });
    const keyA = a.conflicts.filter((c) => c.kind === 'inning_runs').map(conflictKey);
    const keyB = b.conflicts.filter((c) => c.kind === 'inning_runs').map(conflictKey);
    expect(keyA).toContain('inning_runs:1:top');
    expect(keyB).toContain('inning_runs:1:top');
  });

  it('gives distinct keys to distinct conflicts', () => {
    const r = reconcileScoreLogs({ events: topFirstHomers(3) }, { events: topFirstHomers(2) });
    const keys = r.conflicts.map(conflictKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('flags a player present in only one log as null on the other side', () => {
    const events = topFirstHomers(1);
    const home = new Map([['p9', makePitching({ playerId: 'p9', strikeouts: 4 })]]);
    const r = reconcileScoreLogs(
      { events, pitching: home },
      { events, pitching: new Map() },
    );
    expect(r.conflicts).toContainEqual({
      kind: 'player_pitching',
      playerId: 'p9',
      stat: 'strikeouts',
      homeLog: 4,
      awayLog: null,
    });
  });
});
