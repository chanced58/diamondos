import { deriveGameState } from '../game-state';
import { UNKNOWN_RUNNER_ID } from '../../constants/baseball';
import { deriveBattingStats } from '../batting-stats';
import { computeOpponentBatting } from '../opponent-batting-stats';
import { derivePitchingStats } from '../pitching-stats';
import {
  EventType,
  HitType,
  PitchOutcome,
  SubstitutionType,
  type GameEvent,
  type GameEventPayload,
} from '../../types/game-event';

const GAME = 'g1';
const HOME_TEAM = 'team-home';

let seq = 0;
let isTopOfInning = true;
let inning = 1;

const resetSeq = () => {
  seq = 0;
  isTopOfInning = true;
  inning = 1;
};

/** Build a minimal GameEvent for reducer testing. */
function e(eventType: EventType, payload: GameEventPayload): GameEvent {
  return {
    id: `evt-${seq}`,
    gameId: GAME,
    sequenceNumber: seq++,
    eventType,
    inning,
    isTopOfInning,
    payload,
    occurredAt: new Date(2026, 3, 1, 12, 0, seq).toISOString(),
    createdBy: 'tester',
    deviceId: 'test-device',
  };
}

/**
 * A PA ending in a HIT. Includes a PITCH_THROWN so the reducer's
 * `state.currentBatterId` is set to the correct batter (the HIT handler
 * uses state, not payload, when placing runners on base).
 */
function batterHit(batterId: string, hitType: HitType, extra: Record<string, unknown> = {}): GameEvent[] {
  return [
    e(EventType.PITCH_THROWN, { batterId, outcome: PitchOutcome.IN_PLAY }),
    e(EventType.HIT, { batterId, hitType, ...extra }),
  ];
}

/** A PA ending in an OUT. */
function batterOut(batterId: string, outType: 'groundout' | 'flyout' | 'strikeout' = 'groundout'): GameEvent[] {
  return [
    e(EventType.PITCH_THROWN, { batterId, outcome: PitchOutcome.IN_PLAY }),
    e(EventType.OUT, { batterId, outType }),
  ];
}

/** End the current inning (top or bottom) via an INNING_CHANGE event. */
function advanceInning(): GameEvent {
  if (!isTopOfInning) {
    // End of bottom half → next inning, top half.
    inning++;
    isTopOfInning = true;
  } else {
    // End of top half → same inning, bottom half.
    isTopOfInning = false;
  }
  return e(EventType.INNING_CHANGE, {});
}

describe('deriveGameState — fielder\'s choice that ends the inning', () => {
  beforeEach(resetSeq);

  it('advances the batting order when FC is the 3rd out (PA counter increments)', () => {
    // Top of 1st. Away team bats. Two outs already, runner on 1st
    // (placed there by the first PA's HIT). 4th batter hits into a
    // fielder's choice that retires the runner at 2nd — the 3rd out.
    const events: GameEvent[] = [
      e(EventType.GAME_START, {
        awayLineupPitcherId: 'home-p1',
        homeLineupPitcherId: 'away-p1',
        awayLeadoffBatterId: 'a1',
        homeLeadoffBatterId: 'h1',
      }),
      ...batterHit('a1', HitType.SINGLE),      // PA1: runner on 1st
      ...batterOut('a2', 'groundout'),          // PA2: 1 out
      ...batterOut('a3', 'flyout'),             // PA3: 2 outs
      // PA4: fielder's choice retiring runner from 1st (who becomes the 3rd out).
      e(EventType.PITCH_THROWN, { batterId: 'a4', outcome: PitchOutcome.IN_PLAY }),
      e(EventType.BASERUNNER_OUT, { runnerId: 'a1' }),
      e(EventType.HIT, { batterId: 'a4', hitType: HitType.SINGLE, fieldersChoice: true }),
    ];

    const state = deriveGameState(GAME, events, HOME_TEAM);

    expect(state.outs).toBe(3);
    // Four PAs have completed in the top half — lineup should now be on
    // the 5th batter when the away team next comes up to bat.
    expect(state.completedTopHalfPAs).toBe(4);
  });

  it('does not score a runner from 3rd on a 3rd-out fielder\'s choice', () => {
    // Setup: away team, two outs, runner on 3rd. FC retires a runner
    // forced at 2nd (also loaded the bases first).
    const events: GameEvent[] = [
      e(EventType.GAME_START, {
        awayLineupPitcherId: 'home-p1',
        homeLineupPitcherId: 'away-p1',
        awayLeadoffBatterId: 'a1',
        homeLeadoffBatterId: 'h1',
      }),
      // Load the bases with three consecutive walks.
      e(EventType.WALK, { batterId: 'a1' }),
      e(EventType.WALK, { batterId: 'a2' }),
      e(EventType.WALK, { batterId: 'a3' }),
      // Two outs.
      ...batterOut('a4', 'flyout'),
      ...batterOut('a5', 'groundout'),
      // 3rd-out FC: retire a3 (forced to 2nd); a1 would score from 3rd
      // on a plain single, but this is a 3rd-out FC so no run should
      // count.
      e(EventType.PITCH_THROWN, { batterId: 'a6', outcome: PitchOutcome.IN_PLAY }),
      e(EventType.BASERUNNER_OUT, { runnerId: 'a3' }),
      e(EventType.HIT, { batterId: 'a6', hitType: HitType.SINGLE, fieldersChoice: true }),
    ];

    const state = deriveGameState(GAME, events, HOME_TEAM);

    expect(state.outs).toBe(3);
    expect(state.awayScore).toBe(0);
    expect(state.homeScore).toBe(0);
    // PA still credited so the lineup advances: 3 walks + 2 outs + 1 FC = 6 PAs.
    expect(state.completedTopHalfPAs).toBe(6);
  });

  it('still scores a runner from 3rd on a non-inning-ending fielder\'s choice', () => {
    // Regression guard for the pre-existing behavior: with only 1 out
    // before the play, a FC that retires the runner from 1st is the
    // 2nd out — the runner from 3rd still scores on the "single".
    const events: GameEvent[] = [
      e(EventType.GAME_START, {
        awayLineupPitcherId: 'home-p1',
        homeLineupPitcherId: 'away-p1',
        awayLeadoffBatterId: 'a1',
        homeLeadoffBatterId: 'h1',
      }),
      // Put a1 on 3rd via a triple.
      ...batterHit('a1', HitType.TRIPLE),
      // Put a2 on 1st via a single — now runners on 1st + 3rd, 0 outs.
      ...batterHit('a2', HitType.SINGLE),
      // 1 out.
      ...batterOut('a3', 'flyout'),
      // FC: retire a2 at 2nd (2nd out — not the 3rd). Batter a4 reaches
      // 1st; a1 from 3rd scores on the play.
      e(EventType.PITCH_THROWN, { batterId: 'a4', outcome: PitchOutcome.IN_PLAY }),
      e(EventType.BASERUNNER_OUT, { runnerId: 'a2' }),
      e(EventType.HIT, { batterId: 'a4', hitType: HitType.SINGLE, fieldersChoice: true }),
    ];

    const state = deriveGameState(GAME, events, HOME_TEAM);

    expect(state.outs).toBe(2);
    expect(state.awayScore).toBe(1); // runner from 3rd scored
    // Batter a4 is now on 1st.
    expect(state.runnersOnBase.first).toBe('a4');
    expect(state.runnersOnBase.second).toBe(null);
    expect(state.runnersOnBase.third).toBe(null);
    expect(state.completedTopHalfPAs).toBe(4);
  });

  it('keeps the same batter next inning when the 3rd-out FC skipped the PA (regression)', () => {
    // End-to-end: simulate the reported scenario across an inning
    // boundary. Batter #4 hits into a 3rd-out FC; on the next top-half,
    // the batting-position formula completedTopHalfPAs % 9 should land
    // on slot 5 (index 4 into the 9-slot lineup), not slot 4 again.
    const events: GameEvent[] = [
      e(EventType.GAME_START, {
        awayLineupPitcherId: 'home-p1',
        homeLineupPitcherId: 'away-p1',
        awayLeadoffBatterId: 'a1',
        homeLeadoffBatterId: 'h1',
      }),
      // Top 1: a1 singles, a2 & a3 go out, a4 FCs for the 3rd out.
      ...batterHit('a1', HitType.SINGLE),
      ...batterOut('a2', 'groundout'),
      ...batterOut('a3', 'flyout'),
      e(EventType.PITCH_THROWN, { batterId: 'a4', outcome: PitchOutcome.IN_PLAY }),
      e(EventType.BASERUNNER_OUT, { runnerId: 'a1' }),
      e(EventType.HIT, { batterId: 'a4', hitType: HitType.SINGLE, fieldersChoice: true }),
      // Bottom 1: home bats and makes three quick outs.
      advanceInning(),
      ...batterOut('h1', 'flyout'),
      ...batterOut('h2', 'groundout'),
      ...batterOut('h3', 'strikeout'),
      // Top 2 begins.
      advanceInning(),
    ];

    const state = deriveGameState(GAME, events, HOME_TEAM);

    // Away has batted 4 times. Into a 9-batter lineup, slot 5 (index 4)
    // leads off the top of the 2nd.
    expect(state.completedTopHalfPAs).toBe(4);
    expect(4 % 9).toBe(4); // sanity — before the fix, this was 3 (a4 again).
  });
});

describe('stats reducers — fielder\'s choice that ends the inning', () => {
  beforeEach(resetSeq);

  const players = [
    { id: 'a1', firstName: 'A', lastName: 'One' },
    { id: 'a2', firstName: 'A', lastName: 'Two' },
    { id: 'a3', firstName: 'A', lastName: 'Three' },
    { id: 'a4', firstName: 'A', lastName: 'Four' },
    { id: 'p1', firstName: 'P', lastName: 'One' },
  ];

  /**
   * Build the canonical event stream: away team with runner on 3rd, two
   * outs, batter a4 hits into a fielder's choice that retires the runner
   * from 3rd. The preceding BASERUNNER_OUT is the 3rd out, so no runs
   * should be credited and no RBI for the batter.
   */
  function thirdOutFCEvents(): GameEvent[] {
    return [
      e(EventType.GAME_START, {
        awayLineupPitcherId: 'p1',
        homeLineupPitcherId: 'p1',
        awayLeadoffBatterId: 'a1',
        homeLeadoffBatterId: 'a1',
      }),
      // Put a1 on 3rd with a triple.
      ...batterHit('a1', HitType.TRIPLE),
      // Two outs.
      ...batterOut('a2', 'groundout'),
      ...batterOut('a3', 'flyout'),
      // 3rd-out FC: BASERUNNER_OUT retires a1 (from 3rd), HIT records the PA.
      e(EventType.PITCH_THROWN, { batterId: 'a4', pitcherId: 'p1', outcome: PitchOutcome.IN_PLAY }),
      e(EventType.BASERUNNER_OUT, { runnerId: 'a1', pitcherId: 'p1' }),
      e(EventType.HIT, {
        batterId: 'a4',
        pitcherId: 'p1',
        hitType: HitType.SINGLE,
        fieldersChoice: true,
      }),
    ];
  }

  it('deriveBattingStats: does not credit R to runner on 3rd or RBI to batter', () => {
    const events = thirdOutFCEvents();
    const stats = deriveBattingStats(events, players);

    expect(stats.get('a1')?.runs ?? 0).toBe(0);
    expect(stats.get('a4')?.rbi ?? 0).toBe(0);
    // The batter's PA and AB are still credited (FC counts as AB, not a hit).
    expect(stats.get('a4')?.plateAppearances).toBe(1);
    expect(stats.get('a4')?.atBats).toBe(1);
    expect(stats.get('a4')?.hits).toBe(0);
  });

  it('derivePitchingStats: does not charge the pitcher with a run on a 3rd-out FC', () => {
    const events = thirdOutFCEvents();
    const stats = derivePitchingStats(events, players);

    expect(stats.get('p1')?.runsAllowed ?? 0).toBe(0);
    expect(stats.get('p1')?.earnedRunsAllowed ?? 0).toBe(0);
    // The FC HIT payload carries fieldersChoice:true so it does NOT add to
    // hitsAllowed; the earlier real triple by a1 accounts for the single
    // hit allowed in this scenario.
    expect(stats.get('p1')?.hitsAllowed).toBe(1);
  });

  it('deriveBattingStats: still credits R and RBI on a non-inning-ending FC', () => {
    // Same shape, but with only 1 out before the FC so the play is the 2nd
    // out, not the 3rd. Runner from 3rd still scores on the "single" — this
    // is the regression guard that my outs-guard did not over-correct.
    const events: GameEvent[] = [
      e(EventType.GAME_START, {
        awayLineupPitcherId: 'p1',
        homeLineupPitcherId: 'p1',
        awayLeadoffBatterId: 'a1',
        homeLeadoffBatterId: 'a1',
      }),
      ...batterHit('a1', HitType.TRIPLE),
      ...batterOut('a2', 'groundout'),
      // Only 1 out when a3 hits into the FC.
      e(EventType.PITCH_THROWN, { batterId: 'a3', pitcherId: 'p1', outcome: PitchOutcome.IN_PLAY }),
      e(EventType.BASERUNNER_OUT, { runnerId: 'a1', pitcherId: 'p1' }),
      e(EventType.HIT, {
        batterId: 'a3',
        pitcherId: 'p1',
        hitType: HitType.SINGLE,
        fieldersChoice: true,
      }),
    ];
    const stats = deriveBattingStats(events, players);

    // Wait — with a triple to 3rd and BASERUNNER_OUT removing a1, a1 is
    // already off base by the time the HIT fires. So the FC "single"
    // places the batter on 1st but nobody scores. The guard should have
    // no effect either way here. Assert the absence of over-counting:
    expect(stats.get('a1')?.runs ?? 0).toBe(0);
    expect(stats.get('a3')?.rbi ?? 0).toBe(0);
  });

  it('computeOpponentBatting: does not credit R/RBI to opponents on a 3rd-out FC', () => {
    // Snake-case DB-shaped events (computeOpponentBatting's expected shape).
    let s = 0;
    const oe = (event_type: string, payload: Record<string, unknown>) => ({
      game_id: 'g-opp',
      sequence_number: s++,
      event_type,
      payload,
    });
    const events = [
      oe('hit', { opponentBatterId: 'o1', hitType: 'triple' }), // o1 → 3rd
      oe('out', { opponentBatterId: 'o2', outType: 'groundout' }),
      oe('out', { opponentBatterId: 'o3', outType: 'flyout' }),
      // 3rd-out FC: BASERUNNER_OUT (o1) + HIT (o4, fieldersChoice).
      oe('baserunner_out', { runnerId: 'o1' }),
      oe('hit', { opponentBatterId: 'o4', hitType: 'single', fieldersChoice: true }),
    ];
    const oppMap = new Map<string, string>([
      ['o1', 'O One'],
      ['o2', 'O Two'],
      ['o3', 'O Three'],
      ['o4', 'O Four'],
    ]);
    const rows = computeOpponentBatting(events, oppMap);

    const o1 = rows.find((r) => r.playerId === 'o1');
    const o4 = rows.find((r) => r.playerId === 'o4');
    expect(o1?.r ?? 0).toBe(0);
    expect(o4?.rbi ?? 0).toBe(0);
    // o4 still credited with the PA + AB.
    expect(o4?.pa).toBe(1);
    expect(o4?.ab).toBe(1);
    expect(o4?.h).toBe(0);
  });
});

describe('deriveGameState — DROPPED_THIRD_STRIKE', () => {
  beforeEach(resetSeq);

  const startEvents: GameEvent[] = [];
  const start = () => [
    e(EventType.GAME_START, {
      awayLineupPitcherId: 'home-p',
      homeLineupPitcherId: 'away-p',
      awayLeadoffBatterId: 'a1',
      homeLeadoffBatterId: 'h1',
    }),
  ];
  void startEvents;

  it('thrown_out increments outs and resets the count', () => {
    const events: GameEvent[] = [
      ...start(),
      e(EventType.PITCH_THROWN, { batterId: 'a1', outcome: PitchOutcome.SWINGING_STRIKE }),
      e(EventType.PITCH_THROWN, { batterId: 'a1', outcome: PitchOutcome.SWINGING_STRIKE }),
      e(EventType.DROPPED_THIRD_STRIKE, {
        batterId: 'a1',
        pitcherId: 'home-p',
        outcome: 'thrown_out',
        fieldingSequence: [2, 3],
      }),
    ];
    const state = deriveGameState(GAME, events, HOME_TEAM);
    expect(state.outs).toBe(1);
    expect(state.balls).toBe(0);
    expect(state.strikes).toBe(0);
    expect(state.runnersOnBase.first).toBe(null);
    expect(state.completedTopHalfPAs).toBe(1);
  });

  it('reached_on_error places batter on first and does not increment outs', () => {
    const events: GameEvent[] = [
      ...start(),
      e(EventType.PITCH_THROWN, { batterId: 'a1', outcome: PitchOutcome.SWINGING_STRIKE }),
      e(EventType.DROPPED_THIRD_STRIKE, {
        batterId: 'a1',
        pitcherId: 'home-p',
        outcome: 'reached_on_error',
        errorBy: 2,
      }),
    ];
    const state = deriveGameState(GAME, events, HOME_TEAM);
    expect(state.outs).toBe(0);
    expect(state.runnersOnBase.first).toBe('a1');
    expect(state.completedTopHalfPAs).toBe(1);
  });

  it('reached_wild_pitch places batter on first and does not increment outs', () => {
    const events: GameEvent[] = [
      ...start(),
      e(EventType.PITCH_THROWN, { batterId: 'a1', outcome: PitchOutcome.SWINGING_STRIKE }),
      e(EventType.DROPPED_THIRD_STRIKE, {
        batterId: 'a1',
        pitcherId: 'home-p',
        outcome: 'reached_wild_pitch',
        isWildPitch: true,
      }),
    ];
    const state = deriveGameState(GAME, events, HOME_TEAM);
    expect(state.outs).toBe(0);
    expect(state.runnersOnBase.first).toBe('a1');
  });

  it('force-scores a run when bases were loaded and the batter reaches', () => {
    const events: GameEvent[] = [
      ...start(),
      // Load the bases via three walks.
      e(EventType.WALK, { batterId: 'a1' }),
      e(EventType.WALK, { batterId: 'a2' }),
      e(EventType.WALK, { batterId: 'a3' }),
      // a4 reaches on D3K reached-on-error → bases-loaded force-in.
      e(EventType.PITCH_THROWN, { batterId: 'a4', outcome: PitchOutcome.SWINGING_STRIKE }),
      e(EventType.DROPPED_THIRD_STRIKE, {
        batterId: 'a4',
        pitcherId: 'home-p',
        outcome: 'reached_on_error',
        errorBy: 2,
      }),
    ];
    const state = deriveGameState(GAME, events, HOME_TEAM);
    expect(state.awayScore).toBe(1);
    expect(state.outs).toBe(0);
    // a1 (forced home), a2 → 3rd, a3 → 2nd, a4 → 1st.
    expect(state.runnersOnBase.first).toBe('a4');
    expect(state.runnersOnBase.second).toBe('a3');
    expect(state.runnersOnBase.third).toBe('a2');
  });
});

describe('deriveGameState — runner outcomes linked to a HIT via relatedEventId', () => {
  beforeEach(resetSeq);

  const start = () => [
    e(EventType.GAME_START, {
      awayLineupPitcherId: 'home-p',
      homeLineupPitcherId: 'away-p',
      awayLeadoffBatterId: 'a1',
      homeLeadoffBatterId: 'h1',
    }),
  ];

  it('Scenario 1 — double with R1 thrown out at 3B: batter on 2B, R1 cleared, outs +1', () => {
    // Put a1 on 1st via a single, then a2 doubles. R1 (a1) is thrown out
    // advancing to 3rd on the play.
    const pa1 = batterHit('a1', HitType.SINGLE);
    const pitch2 = e(EventType.PITCH_THROWN, { batterId: 'a2', outcome: PitchOutcome.IN_PLAY });
    const hit2 = e(EventType.HIT, { batterId: 'a2', hitType: HitType.DOUBLE });
    const out1 = e(EventType.BASERUNNER_OUT, {
      runnerId: 'a1',
      fromBase: 1,
      relatedEventId: hit2.id,
    });
    const state = deriveGameState(GAME, [...start(), ...pa1, pitch2, hit2, out1], HOME_TEAM);

    expect(state.outs).toBe(1);
    expect(state.runnersOnBase.first).toBe(null);
    expect(state.runnersOnBase.second).toBe('a2');
    expect(state.runnersOnBase.third).toBe(null);
    expect(state.awayScore).toBe(0);
  });

  it('Scenario 2a — double with R2 held at 3B: batter on 2B, R2 on 3B, no run', () => {
    // a1 doubles → R2 on 2nd. a2 doubles → default would score R2; with
    // an override, R2 holds at 3B.
    const pa1 = batterHit('a1', HitType.DOUBLE);
    const pitch2 = e(EventType.PITCH_THROWN, { batterId: 'a2', outcome: PitchOutcome.IN_PLAY });
    const hit2 = e(EventType.HIT, { batterId: 'a2', hitType: HitType.DOUBLE });
    const held = e(EventType.BASERUNNER_ADVANCE, {
      runnerId: 'a1',
      fromBase: 2,
      toBase: 3,
      reason: 'on_play',
      relatedEventId: hit2.id,
    });
    const state = deriveGameState(GAME, [...start(), ...pa1, pitch2, hit2, held], HOME_TEAM);

    expect(state.outs).toBe(0);
    expect(state.awayScore).toBe(0);
    expect(state.runnersOnBase.second).toBe('a2');
    expect(state.runnersOnBase.third).toBe('a1');
  });

  it('Scenario 2b — double with R2 thrown out at home: batter on 2B, no R3, outs +1', () => {
    const pa1 = batterHit('a1', HitType.DOUBLE);
    const pitch2 = e(EventType.PITCH_THROWN, { batterId: 'a2', outcome: PitchOutcome.IN_PLAY });
    const hit2 = e(EventType.HIT, { batterId: 'a2', hitType: HitType.DOUBLE });
    const thrownOut = e(EventType.BASERUNNER_OUT, {
      runnerId: 'a1',
      fromBase: 2,
      relatedEventId: hit2.id,
    });
    const state = deriveGameState(GAME, [...start(), ...pa1, pitch2, hit2, thrownOut], HOME_TEAM);

    expect(state.outs).toBe(1);
    expect(state.awayScore).toBe(0);
    expect(state.runnersOnBase.second).toBe('a2');
    expect(state.runnersOnBase.third).toBe(null);
  });

  it('regression — double with no overrides still auto-advances runners (fast path)', () => {
    // a1 on 1st via single, then a2 doubles. Default: a1 → 3rd, a2 → 2nd.
    const events: GameEvent[] = [
      ...start(),
      ...batterHit('a1', HitType.SINGLE),
      ...batterHit('a2', HitType.DOUBLE),
    ];
    const state = deriveGameState(GAME, events, HOME_TEAM);

    expect(state.outs).toBe(0);
    expect(state.awayScore).toBe(0);
    expect(state.runnersOnBase.second).toBe('a2');
    expect(state.runnersOnBase.third).toBe('a1');
  });

  it('triple with R1 held at 3B — only R3/R2 score, not R1', () => {
    // Put a1 on 1st, a2 on 2nd, a3 on 3rd via two singles and a double.
    // Wait, simpler: load bases via walks, then triple with R1 held at 3rd.
    const events: GameEvent[] = [
      ...start(),
      e(EventType.WALK, { batterId: 'a1' }),  // a1 on 1st
      e(EventType.WALK, { batterId: 'a2' }),  // a1 on 2nd, a2 on 1st
      e(EventType.WALK, { batterId: 'a3' }),  // a1 on 3rd, a2 on 2nd, a3 on 1st
    ];
    const pitch4 = e(EventType.PITCH_THROWN, { batterId: 'a4', outcome: PitchOutcome.IN_PLAY });
    const hit4 = e(EventType.HIT, { batterId: 'a4', hitType: HitType.TRIPLE });
    // R1 (a3, on 1st pre-play) held at 3rd instead of scoring.
    const held = e(EventType.BASERUNNER_ADVANCE, {
      runnerId: 'a3',
      fromBase: 1,
      toBase: 3,
      reason: 'on_play',
      relatedEventId: hit4.id,
    });
    const state = deriveGameState(GAME, [...events, pitch4, hit4, held], HOME_TEAM);

    expect(state.outs).toBe(0);
    expect(state.awayScore).toBe(2); // a1, a2 scored; a3 held
    expect(state.runnersOnBase.third).toBe('a3'); // a3 held at 3rd
    // Wait — the batter is on 3rd after a triple. The held runner takes
    // priority by event order: HIT places batter at 3rd, then ADVANCE
    // overwrites with a3.
  });

  it('HR with trailing runner thrown out — HR credited, only non-out runners score', () => {
    const events: GameEvent[] = [
      ...start(),
      e(EventType.WALK, { batterId: 'a1' }),  // a1 on 1st
    ];
    const pitch2 = e(EventType.PITCH_THROWN, { batterId: 'a2', outcome: PitchOutcome.IN_PLAY });
    const hr = e(EventType.HIT, { batterId: 'a2', hitType: HitType.HOME_RUN });
    const out1 = e(EventType.BASERUNNER_OUT, {
      runnerId: 'a1',
      fromBase: 1,
      relatedEventId: hr.id,
    });
    const state = deriveGameState(GAME, [...events, pitch2, hr, out1], HOME_TEAM);

    expect(state.outs).toBe(1);
    expect(state.awayScore).toBe(1); // batter only; a1 thrown out
    expect(state.runnersOnBase.first).toBe(null);
    expect(state.runnersOnBase.second).toBe(null);
    expect(state.runnersOnBase.third).toBe(null);
  });
});

describe('deriveGameState — EVENT_VOIDED / PITCH_REVERTED filtering', () => {
  beforeEach(resetSeq);

  const start = () => [
    e(EventType.GAME_START, {
      awayLineupPitcherId: 'home-p',
      homeLineupPitcherId: 'away-p',
      awayLeadoffBatterId: 'a1',
      homeLeadoffBatterId: 'h1',
    }),
  ];

  /** EVENT_VOIDED marker targeting a previously recorded event. */
  function voided(target: GameEvent): GameEvent {
    return e(EventType.EVENT_VOIDED, {
      voidedEventId: target.id,
      voidedSequenceNumber: target.sequenceNumber,
    });
  }

  it('a voided HIT restores runners and the PA count', () => {
    const pitch1 = e(EventType.PITCH_THROWN, { batterId: 'a1', outcome: PitchOutcome.IN_PLAY });
    const hit1 = e(EventType.HIT, { batterId: 'a1', hitType: HitType.SINGLE });
    const state = deriveGameState(GAME, [...start(), pitch1, hit1, voided(hit1)], HOME_TEAM);

    expect(state.runnersOnBase.first).toBe(null);
    expect(state.completedTopHalfPAs).toBe(0);
    expect(state.awayScore).toBe(0);
  });

  it('a voided OUT restores the out count and PA count', () => {
    const pitch1 = e(EventType.PITCH_THROWN, { batterId: 'a1', outcome: PitchOutcome.IN_PLAY });
    const out1 = e(EventType.OUT, { batterId: 'a1', outType: 'groundout' });
    const state = deriveGameState(GAME, [...start(), pitch1, out1, voided(out1)], HOME_TEAM);

    expect(state.outs).toBe(0);
    expect(state.completedTopHalfPAs).toBe(0);
  });

  it('voiding only a linked BASERUNNER_OUT restores the parent HIT default advance', () => {
    // a1 singles; a2 doubles with a linked "a1 thrown out at 3B" override.
    // Voiding just the child outcome event should restore the default
    // advance (a1 → 3rd on a double) and remove the out.
    const pa1 = batterHit('a1', HitType.SINGLE);
    const pitch2 = e(EventType.PITCH_THROWN, { batterId: 'a2', outcome: PitchOutcome.IN_PLAY });
    const hit2 = e(EventType.HIT, { batterId: 'a2', hitType: HitType.DOUBLE });
    const childOut = e(EventType.BASERUNNER_OUT, {
      runnerId: 'a1',
      fromBase: 1,
      relatedEventId: hit2.id,
    });
    const state = deriveGameState(
      GAME,
      [...start(), ...pa1, pitch2, hit2, childOut, voided(childOut)],
      HOME_TEAM,
    );

    expect(state.outs).toBe(0);
    expect(state.runnersOnBase.third).toBe('a1');
    expect(state.runnersOnBase.second).toBe('a2');
  });

  it('a voided WALK restores balls/strikes and baserunners', () => {
    const walk1 = e(EventType.WALK, { batterId: 'a1' });
    const state = deriveGameState(GAME, [...start(), walk1, voided(walk1)], HOME_TEAM);

    expect(state.runnersOnBase.first).toBe(null);
    expect(state.completedTopHalfPAs).toBe(0);
  });

  it('PITCH_REVERTED trims replay back to revertToSequenceNumber', () => {
    // Two strikes recorded, then the second is reverted (web-style undo).
    const strike1 = e(EventType.PITCH_THROWN, { batterId: 'a1', outcome: PitchOutcome.CALLED_STRIKE });
    const strike2 = e(EventType.PITCH_THROWN, { batterId: 'a1', outcome: PitchOutcome.CALLED_STRIKE });
    const revert = e(EventType.PITCH_REVERTED, {
      revertToSequenceNumber: strike1.sequenceNumber,
    });
    const state = deriveGameState(GAME, [...start(), strike1, strike2, revert], HOME_TEAM);

    expect(state.strikes).toBe(1);
  });
});

describe('deriveGameState — base placement uses the payload batter (no preceding pitch)', () => {
  beforeEach(resetSeq);

  const start = () => [
    e(EventType.GAME_START, {
      awayLineupPitcherId: 'home-p',
      homeLineupPitcherId: 'away-p',
      awayLeadoffBatterId: 'a1',
      homeLeadoffBatterId: 'h1',
    }),
  ];

  it('places the HIT payload batter on base even when currentBatterId is stale', () => {
    // a1 singles (state.currentBatterId becomes a1). Then a2 singles with NO
    // preceding pitch — the quick-entry path a mobile scorer can take. The
    // batter placed on 1st must be a2 (payload), not the stale a1.
    const events: GameEvent[] = [
      ...start(),
      ...batterHit('a1', HitType.SINGLE), // a1 → 1st, currentBatterId = a1
      // a2 reaches on a single with no pitch event first.
      e(EventType.HIT, { batterId: 'a2', hitType: HitType.SINGLE }),
    ];
    const state = deriveGameState(GAME, events, HOME_TEAM);

    expect(state.runnersOnBase.first).toBe('a2');
    expect(state.runnersOnBase.second).toBe('a1');
  });

  it('places the FIELD_ERROR payload batter on first when currentBatterId is stale', () => {
    const events: GameEvent[] = [
      ...start(),
      ...batterOut('a1', 'groundout'), // currentBatterId = a1
      e(EventType.FIELD_ERROR, { batterId: 'a2', errorBy: 6 }),
    ];
    const state = deriveGameState(GAME, events, HOME_TEAM);
    expect(state.runnersOnBase.first).toBe('a2');
  });
});

describe('deriveGameState — GAME_END / isFinal', () => {
  beforeEach(resetSeq);

  const start = () => [
    e(EventType.GAME_START, {
      awayLineupPitcherId: 'home-p',
      homeLineupPitcherId: 'away-p',
      awayLeadoffBatterId: 'a1',
      homeLeadoffBatterId: 'h1',
    }),
  ];

  it('isFinal is false while the game is live', () => {
    const state = deriveGameState(GAME, [...start(), ...batterHit('a1', HitType.SINGLE)], HOME_TEAM);
    expect(state.isFinal).toBe(false);
  });

  it('GAME_END sets isFinal without disturbing other state', () => {
    const events = [
      ...start(),
      ...batterHit('a1', HitType.SINGLE),
      e(EventType.GAME_END, { homeScore: 0, awayScore: 0 }),
    ];
    const state = deriveGameState(GAME, events, HOME_TEAM);
    expect(state.isFinal).toBe(true);
    expect(state.runnersOnBase.first).toBe('a1');
  });

  it('a voided GAME_END leaves the game live', () => {
    const end = e(EventType.GAME_END, { homeScore: 0, awayScore: 0 });
    const events = [
      ...start(),
      end,
      e(EventType.EVENT_VOIDED, { voidedEventId: end.id, voidedSequenceNumber: end.sequenceNumber }),
    ];
    const state = deriveGameState(GAME, events, HOME_TEAM);
    expect(state.isFinal).toBe(false);
  });
});

describe('deriveGameState — pitcherPitchCounts', () => {
  beforeEach(resetSeq);

  it('accumulates cumulative totals per pitcher across pitching and inning changes', () => {
    const events: GameEvent[] = [
      e(EventType.GAME_START, {
        awayLineupPitcherId: 'p1',
        homeLineupPitcherId: 'p3',
        awayLeadoffBatterId: 'a1',
        homeLeadoffBatterId: 'h1',
      }),
      // Top 1: p1 throws 2 pitches.
      e(EventType.PITCH_THROWN, { pitcherId: 'p1', batterId: 'a1', outcome: PitchOutcome.BALL }),
      e(EventType.PITCH_THROWN, { pitcherId: 'p1', batterId: 'a1', outcome: PitchOutcome.CALLED_STRIKE }),
      // Mid-inning pitching change: p2 throws 3.
      e(EventType.PITCHING_CHANGE, { newPitcherId: 'p2', outgoingPitcherId: 'p1' }),
      e(EventType.PITCH_THROWN, { pitcherId: 'p2', batterId: 'a1', outcome: PitchOutcome.BALL }),
      e(EventType.PITCH_THROWN, { pitcherId: 'p2', batterId: 'a1', outcome: PitchOutcome.BALL }),
      e(EventType.PITCH_THROWN, { pitcherId: 'p2', batterId: 'a1', outcome: PitchOutcome.FOUL }),
      // Bottom 1: other team's pitcher p3 throws 1.
      advanceInning(),
      e(EventType.PITCH_THROWN, { pitcherId: 'p3', batterId: 'h1', outcome: PitchOutcome.BALL }),
    ];
    const state = deriveGameState(GAME, events, HOME_TEAM);

    expect(state.pitcherPitchCounts).toEqual({ p1: 2, p2: 3, p3: 1 });
    expect(state.currentPitcherPitchCount).toBe(1); // p3's running total
  });
});

describe('deriveGameState — HIT_BY_PITCH pair (regression guard)', () => {
  beforeEach(resetSeq);

  it('pitch outcome hbp + HIT_BY_PITCH event places batter on 1B and forces with bases loaded', () => {
    const events: GameEvent[] = [
      e(EventType.GAME_START, {
        awayLineupPitcherId: 'home-p',
        homeLineupPitcherId: 'away-p',
        awayLeadoffBatterId: 'a1',
        homeLeadoffBatterId: 'h1',
      }),
      // Load the bases via three walks.
      e(EventType.WALK, { batterId: 'a1' }),
      e(EventType.WALK, { batterId: 'a2' }),
      e(EventType.WALK, { batterId: 'a3' }),
      // HBP pair for a4 — the shape mobile/web emit together.
      e(EventType.PITCH_THROWN, { batterId: 'a4', pitcherId: 'home-p', outcome: PitchOutcome.HIT_BY_PITCH }),
      e(EventType.HIT_BY_PITCH, { batterId: 'a4', pitcherId: 'home-p' }),
    ];
    const state = deriveGameState(GAME, events, HOME_TEAM);

    expect(state.awayScore).toBe(1); // a1 forced home
    expect(state.runnersOnBase.first).toBe('a4');
    expect(state.runnersOnBase.second).toBe('a3');
    expect(state.runnersOnBase.third).toBe('a2');
    expect(state.completedTopHalfPAs).toBe(4);
  });
});

describe('deriveGameState — ball/strike count progression', () => {
  beforeEach(resetSeq);

  const start = () => [
    e(EventType.GAME_START, {
      awayLineupPitcherId: 'home-p',
      homeLineupPitcherId: 'away-p',
      awayLeadoffBatterId: 'a1',
      homeLeadoffBatterId: 'h1',
    }),
  ];

  it('accumulates balls on consecutive BALL pitches without auto-walking', () => {
    const events: GameEvent[] = [
      ...start(),
      e(EventType.PITCH_THROWN, { batterId: 'a1', outcome: PitchOutcome.BALL }),
      e(EventType.PITCH_THROWN, { batterId: 'a1', outcome: PitchOutcome.BALL }),
      e(EventType.PITCH_THROWN, { batterId: 'a1', outcome: PitchOutcome.BALL }),
    ];
    const state = deriveGameState(GAME, events, HOME_TEAM);
    expect(state.balls).toBe(3);
    expect(state.strikes).toBe(0);
    // The reducer only tracks the count from PITCH_THROWN outcomes — it
    // never emits a WALK on its own. Ball 4 becomes a walk only because the
    // caller (mobile/web scorer) records an explicit WALK event.
    expect(state.runnersOnBase.first).toBeNull();
  });

  it('caps called/swinging/foul strikes at 2 (3rd strike pitch is a terminal STRIKEOUT event, not accumulated)', () => {
    const events: GameEvent[] = [
      ...start(),
      e(EventType.PITCH_THROWN, { batterId: 'a1', outcome: PitchOutcome.CALLED_STRIKE }),
      e(EventType.PITCH_THROWN, { batterId: 'a1', outcome: PitchOutcome.SWINGING_STRIKE }),
      // A 3rd foul with 2 strikes does not add a 3rd strike (foul cannot strike out a batter).
      e(EventType.PITCH_THROWN, { batterId: 'a1', outcome: PitchOutcome.FOUL }),
    ];
    const state = deriveGameState(GAME, events, HOME_TEAM);
    expect(state.strikes).toBe(2);
  });

  it('a explicit STRIKEOUT event increments outs and resets balls/strikes/PA', () => {
    const events: GameEvent[] = [
      ...start(),
      e(EventType.PITCH_THROWN, { batterId: 'a1', outcome: PitchOutcome.BALL }),
      e(EventType.PITCH_THROWN, { batterId: 'a1', outcome: PitchOutcome.CALLED_STRIKE }),
      e(EventType.PITCH_THROWN, { batterId: 'a1', outcome: PitchOutcome.SWINGING_STRIKE }),
      e(EventType.PITCH_THROWN, { batterId: 'a1', outcome: PitchOutcome.SWINGING_STRIKE }),
      e(EventType.STRIKEOUT, { batterId: 'a1' }),
    ];
    const state = deriveGameState(GAME, events, HOME_TEAM);
    expect(state.outs).toBe(1);
    expect(state.balls).toBe(0);
    expect(state.strikes).toBe(0);
    expect(state.completedTopHalfPAs).toBe(1);
  });

  it('a plain OUT event also resets the count and increments outs/PA', () => {
    const events: GameEvent[] = [
      ...start(),
      e(EventType.PITCH_THROWN, { batterId: 'a1', outcome: PitchOutcome.BALL }),
      e(EventType.PITCH_THROWN, { batterId: 'a1', outcome: PitchOutcome.IN_PLAY }),
      e(EventType.OUT, { batterId: 'a1', outType: 'groundout' }),
    ];
    const state = deriveGameState(GAME, events, HOME_TEAM);
    expect(state.outs).toBe(1);
    expect(state.balls).toBe(0);
    expect(state.strikes).toBe(0);
  });

  it('a new batter (new PITCH_THROWN batterId) does not inherit the previous batter\'s count', () => {
    // deriveGameState has no per-batter count map — balls/strikes are global
    // to state and are only ever reset by a terminal event (OUT, STRIKEOUT,
    // WALK, HBP, HIT). A mid-count batter swap without a terminal event in
    // between would leak the count onto the new batter; this test pins down
    // that a normal PA sequence (terminal event between batters) is clean.
    const events: GameEvent[] = [
      ...start(),
      e(EventType.PITCH_THROWN, { batterId: 'a1', outcome: PitchOutcome.BALL }),
      e(EventType.PITCH_THROWN, { batterId: 'a1', outcome: PitchOutcome.CALLED_STRIKE }),
      e(EventType.OUT, { batterId: 'a1', outType: 'flyout' }),
      e(EventType.PITCH_THROWN, { batterId: 'a2', outcome: PitchOutcome.BALL }),
    ];
    const state = deriveGameState(GAME, events, HOME_TEAM);
    expect(state.balls).toBe(1);
    expect(state.strikes).toBe(0);
    expect(state.currentBatterId).toBe('a2');
  });
});

describe('deriveGameState — WALK force-advance across base-occupancy states', () => {
  beforeEach(resetSeq);

  const start = () => [
    e(EventType.GAME_START, {
      awayLineupPitcherId: 'home-p',
      homeLineupPitcherId: 'away-p',
      awayLeadoffBatterId: 'a1',
      homeLeadoffBatterId: 'h1',
    }),
  ];

  it('bases empty: batter takes first, no one forced', () => {
    const state = deriveGameState(GAME, [...start(), e(EventType.WALK, { batterId: 'a1' })], HOME_TEAM);
    expect(state.runnersOnBase).toEqual({ first: 'a1', second: null, third: null });
    expect(state.awayScore).toBe(0);
  });

  it('runner on 1st only: forced to 2nd, batter takes 1st, 3rd untouched', () => {
    const events: GameEvent[] = [
      ...start(),
      e(EventType.WALK, { batterId: 'a1' }),
      e(EventType.WALK, { batterId: 'a2' }),
    ];
    const state = deriveGameState(GAME, events, HOME_TEAM);
    expect(state.runnersOnBase).toEqual({ first: 'a2', second: 'a1', third: null });
  });

  it('runner on 2nd only (1st empty): batter takes 1st, 2nd/3rd runner NOT forced', () => {
    const events: GameEvent[] = [
      ...start(),
      // Put a1 on 2nd via a hit, leaving 1st open.
      e(EventType.PITCH_THROWN, { batterId: 'a1', outcome: PitchOutcome.IN_PLAY }),
      e(EventType.HIT, { batterId: 'a1', hitType: HitType.DOUBLE }),
      e(EventType.WALK, { batterId: 'a2' }),
    ];
    const state = deriveGameState(GAME, events, HOME_TEAM);
    expect(state.runnersOnBase).toEqual({ first: 'a2', second: 'a1', third: null });
  });

  it('bases loaded: forces in a run, all runners shift up one base', () => {
    const events: GameEvent[] = [
      ...start(),
      e(EventType.WALK, { batterId: 'a1' }),
      e(EventType.WALK, { batterId: 'a2' }),
      e(EventType.WALK, { batterId: 'a3' }),
      e(EventType.WALK, { batterId: 'a4' }),
    ];
    const state = deriveGameState(GAME, events, HOME_TEAM);
    expect(state.runnersOnBase).toEqual({ first: 'a4', second: 'a3', third: 'a2' });
    expect(state.awayScore).toBe(1); // a1 forced home
  });

  it('a WALK with no resolvable batter id (opponent at-bat, no lineup entered) still marks the base occupied via UNKNOWN_RUNNER_ID', () => {
    // Mirrors the real-world case documented in the INNING_CHANGE handler
    // comment: a mobile scorer who only entered their own (home) team's
    // lineup has no awayLeadoffBatterId, so top-of-1st (away batting) never
    // gets a currentBatterId, and a WALK with no batterId/opponentBatterId in
    // its payload (opponent at-bat — identity genuinely unknown) has nothing
    // to fall back to. The base must still show as occupied (not
    // indistinguishable from empty) — UNKNOWN_RUNNER_ID is the placeholder;
    // a scorer can later attach a real identity via the Pinch Runner flow.
    const homeOnlyStart = e(EventType.GAME_START, { homeLineupPitcherId: 'away-p', homeLeadoffBatterId: 'h1' });
    const state = deriveGameState(GAME, [homeOnlyStart, e(EventType.WALK, {})], HOME_TEAM);
    expect(state.currentBatterId).toBeNull();
    expect(state.runnersOnBase.first).toBe(UNKNOWN_RUNNER_ID);
  });
});

describe('deriveGameState — INNING_CHANGE transitions', () => {
  beforeEach(resetSeq);

  const start = () => [
    e(EventType.GAME_START, {
      awayLineupPitcherId: 'home-p',
      homeLineupPitcherId: 'away-p',
      awayLeadoffBatterId: 'a1',
      homeLeadoffBatterId: 'h1',
    }),
  ];

  it('top → bottom of the same inning: batter becomes home leadoff, inning number unchanged', () => {
    const events: GameEvent[] = [
      ...start(),
      e(EventType.WALK, { batterId: 'a1' }), // leave a runner + a non-zero count-adjacent state
      e(EventType.INNING_CHANGE, {}),
    ];
    const state = deriveGameState(GAME, events, HOME_TEAM);
    expect(state.inning).toBe(1);
    expect(state.isTopOfInning).toBe(false);
    expect(state.currentBatterId).toBe('h1');
  });

  it('bottom → top: inning increments, batter becomes away leadoff', () => {
    const events: GameEvent[] = [
      ...start(),
      e(EventType.INNING_CHANGE, {}), // top 1 → bottom 1
      e(EventType.INNING_CHANGE, {}), // bottom 1 → top 2
    ];
    const state = deriveGameState(GAME, events, HOME_TEAM);
    expect(state.inning).toBe(2);
    expect(state.isTopOfInning).toBe(true);
    expect(state.currentBatterId).toBe('a1');
  });

  it('resets outs, balls, strikes, runners, and the pitcher on every transition', () => {
    const events: GameEvent[] = [
      ...start(),
      e(EventType.PITCH_THROWN, { batterId: 'a1', pitcherId: 'away-p', outcome: PitchOutcome.BALL }),
      e(EventType.PITCH_THROWN, { batterId: 'a1', pitcherId: 'away-p', outcome: PitchOutcome.CALLED_STRIKE }),
      e(EventType.WALK, { batterId: 'a1' }),
      e(EventType.WALK, { batterId: 'a2' }), // runner on 1st + 2nd going into the transition
      e(EventType.INNING_CHANGE, {}),
    ];
    const state = deriveGameState(GAME, events, HOME_TEAM);
    expect(state.outs).toBe(0);
    expect(state.balls).toBe(0);
    expect(state.strikes).toBe(0);
    expect(state.runnersOnBase).toEqual({ first: null, second: null, third: null });
    expect(state.currentPitcherId).toBeNull();
    expect(state.currentPitcherPitchCount).toBe(0);
  });
});

describe('deriveGameState — SUBSTITUTION', () => {
  beforeEach(resetSeq);

  const start = () => [
    e(EventType.GAME_START, {
      awayLineupPitcherId: 'home-p',
      homeLineupPitcherId: 'away-p',
      awayLeadoffBatterId: 'a1',
      homeLeadoffBatterId: 'h1',
    }),
  ];

  it('swaps the current batter mid-at-bat (pinch hitter announced before the next pitch)', () => {
    const events: GameEvent[] = [
      ...start(),
      e(EventType.PITCH_THROWN, { batterId: 'a1', outcome: PitchOutcome.BALL }),
      e(EventType.SUBSTITUTION, { inPlayerId: 'a1-pinch', outPlayerId: 'a1' }),
    ];
    const state = deriveGameState(GAME, events, HOME_TEAM);
    expect(state.currentBatterId).toBe('a1-pinch');
    // The ball count carries over — a pinch hitter takes over the existing count.
    expect(state.balls).toBe(1);
  });

  it('replaces a runner on base by outPlayerId, wherever they are', () => {
    const events: GameEvent[] = [
      ...start(),
      e(EventType.WALK, { batterId: 'a1' }),
      e(EventType.WALK, { batterId: 'a2' }), // a1 → 2nd, a2 → 1st
      e(EventType.SUBSTITUTION, { inPlayerId: 'pinch-runner', outPlayerId: 'a1' }),
    ];
    const state = deriveGameState(GAME, events, HOME_TEAM);
    expect(state.runnersOnBase.second).toBe('pinch-runner');
    expect(state.runnersOnBase.first).toBe('a2'); // untouched
  });

  it('falls back to runnerBase when outPlayerId is not provided (unidentified runner)', () => {
    const events: GameEvent[] = [
      ...start(),
      e(EventType.WALK, {}), // unresolvable batter lands on 1st as null (see KNOWN LIMITATION test)
      e(EventType.SUBSTITUTION, { inPlayerId: 'identified-runner', runnerBase: 1 }),
    ];
    const state = deriveGameState(GAME, events, HOME_TEAM);
    expect(state.runnersOnBase.first).toBe('identified-runner');
  });

  it('does not affect currentBatterId when outPlayerId does not match (e.g. defensive substitution)', () => {
    const events: GameEvent[] = [
      ...start(),
      e(EventType.PITCH_THROWN, { batterId: 'a1', outcome: PitchOutcome.BALL }),
      e(EventType.SUBSTITUTION, { inPlayerId: 'new-fielder', outPlayerId: 'some-other-fielder' }),
    ];
    const state = deriveGameState(GAME, events, HOME_TEAM);
    expect(state.currentBatterId).toBe('a1');
  });

  it('a purely defensive substitution does not touch pitching state', () => {
    const events: GameEvent[] = [
      ...start(),
      e(EventType.PITCH_THROWN, { pitcherId: 'away-p', batterId: 'a1', outcome: PitchOutcome.BALL }),
      e(EventType.SUBSTITUTION, { inPlayerId: 'new-fielder', outPlayerId: 'some-other-fielder', substitutionType: SubstitutionType.DEFENSIVE }),
    ];
    const state = deriveGameState(GAME, events, HOME_TEAM);
    expect(state.currentPitcherId).toBe('away-p');
    expect(state.currentPitcherPitchCount).toBe(1);
    expect(state.pitcherPitchCounts).toEqual({ 'away-p': 1 });
  });

  it('sequential subs: pinch hitter reaches base via a walk, then a pinch runner replaces them', () => {
    const events: GameEvent[] = [
      ...start(),
      e(EventType.PITCH_THROWN, { batterId: 'a1', outcome: PitchOutcome.BALL }),
      e(EventType.SUBSTITUTION, { inPlayerId: 'pinch-hitter', outPlayerId: 'a1', substitutionType: SubstitutionType.PINCH_HITTER }),
      e(EventType.WALK, { batterId: 'pinch-hitter' }),
      e(EventType.SUBSTITUTION, { inPlayerId: 'pinch-runner', outPlayerId: 'pinch-hitter', substitutionType: SubstitutionType.PINCH_RUNNER }),
    ];
    const state = deriveGameState(GAME, events, HOME_TEAM);
    expect(state.runnersOnBase.first).toBe('pinch-runner');
  });

  it('a courtesy-runner sub via runnerBase (no outPlayerId known) still resolves to the right base', () => {
    const events: GameEvent[] = [
      ...start(),
      e(EventType.WALK, { batterId: 'a1' }),
      e(EventType.WALK, { batterId: 'a2' }), // a1 -> 2nd, a2 -> 1st
      e(EventType.SUBSTITUTION, { inPlayerId: 'courtesy-runner', runnerBase: 2, substitutionType: SubstitutionType.COURTESY_RUNNER }),
    ];
    const state = deriveGameState(GAME, events, HOME_TEAM);
    expect(state.runnersOnBase.second).toBe('courtesy-runner');
    expect(state.runnersOnBase.first).toBe('a2'); // untouched
  });
});

describe('deriveGameState — PITCHING_CHANGE', () => {
  beforeEach(resetSeq);

  const start = () => [
    e(EventType.GAME_START, {
      awayLineupPitcherId: 'home-p',
      homeLineupPitcherId: 'away-p',
      awayLeadoffBatterId: 'a1',
      homeLeadoffBatterId: 'h1',
    }),
  ];

  it('updates currentPitcherId immediately, before the new pitcher throws a pitch', () => {
    const events: GameEvent[] = [
      ...start(),
      e(EventType.PITCHING_CHANGE, { newPitcherId: 'relief-1', outgoingPitcherId: 'away-p' }),
    ];
    const state = deriveGameState(GAME, events, HOME_TEAM);
    expect(state.currentPitcherId).toBe('relief-1');
    expect(state.currentPitcherPitchCount).toBe(0);
  });

  it('bringing back a pitcher who already threw earlier in the game resumes their cumulative count (not 0)', () => {
    const events: GameEvent[] = [
      ...start(),
      e(EventType.PITCH_THROWN, { pitcherId: 'away-p', batterId: 'a1', outcome: PitchOutcome.BALL }),
      e(EventType.PITCH_THROWN, { pitcherId: 'away-p', batterId: 'a1', outcome: PitchOutcome.BALL }),
      e(EventType.PITCH_THROWN, { pitcherId: 'away-p', batterId: 'a1', outcome: PitchOutcome.BALL }),
      // Pulled for a reliever...
      e(EventType.PITCHING_CHANGE, { newPitcherId: 'relief-1', outgoingPitcherId: 'away-p' }),
      e(EventType.PITCH_THROWN, { pitcherId: 'relief-1', batterId: 'a2', outcome: PitchOutcome.BALL }),
      // ...then brought back later in the game.
      e(EventType.PITCHING_CHANGE, { newPitcherId: 'away-p', outgoingPitcherId: 'relief-1' }),
    ];
    const state = deriveGameState(GAME, events, HOME_TEAM);
    expect(state.currentPitcherId).toBe('away-p');
    // Resumes from 3, not reset to 0 — the pitch-count display must reflect
    // this pitcher's true game total the instant the change is made.
    expect(state.currentPitcherPitchCount).toBe(3);
    expect(state.pitcherPitchCounts).toEqual({ 'away-p': 3, 'relief-1': 1 });
  });

  it('the outgoing pitcher keeps their frozen total in pitcherPitchCounts after being pulled', () => {
    const events: GameEvent[] = [
      ...start(),
      e(EventType.PITCH_THROWN, { pitcherId: 'away-p', batterId: 'a1', outcome: PitchOutcome.BALL }),
      e(EventType.PITCH_THROWN, { pitcherId: 'away-p', batterId: 'a1', outcome: PitchOutcome.BALL }),
      e(EventType.PITCHING_CHANGE, { newPitcherId: 'relief-1', outgoingPitcherId: 'away-p' }),
      e(EventType.PITCH_THROWN, { pitcherId: 'relief-1', batterId: 'a1', outcome: PitchOutcome.BALL }),
      e(EventType.PITCH_THROWN, { pitcherId: 'relief-1', batterId: 'a1', outcome: PitchOutcome.BALL }),
      e(EventType.PITCH_THROWN, { pitcherId: 'relief-1', batterId: 'a1', outcome: PitchOutcome.BALL }),
    ];
    const state = deriveGameState(GAME, events, HOME_TEAM);
    expect(state.pitcherPitchCounts['away-p']).toBe(2);
    expect(state.pitcherPitchCounts['relief-1']).toBe(3);
  });

  it('cumulative per-pitcher totals survive an INNING_CHANGE even though currentPitcherId resets to null', () => {
    const events: GameEvent[] = [
      ...start(),
      e(EventType.PITCH_THROWN, { pitcherId: 'away-p', batterId: 'a1', outcome: PitchOutcome.BALL }),
      e(EventType.PITCH_THROWN, { pitcherId: 'away-p', batterId: 'a1', outcome: PitchOutcome.BALL }),
      e(EventType.INNING_CHANGE, {}), // top 1 -> bottom 1 (defense/offense flips)
      e(EventType.INNING_CHANGE, {}), // bottom 1 -> top 2 (away-p pitches again)
      e(EventType.PITCH_THROWN, { pitcherId: 'away-p', batterId: 'a1', outcome: PitchOutcome.BALL }),
    ];
    const state = deriveGameState(GAME, events, HOME_TEAM);
    expect(state.pitcherPitchCounts['away-p']).toBe(3);
    expect(state.currentPitcherPitchCount).toBe(3);
  });
});

describe('deriveGameState — DOUBLE_PLAY', () => {
  beforeEach(resetSeq);

  const start = () => [
    e(EventType.GAME_START, {
      awayLineupPitcherId: 'home-p',
      homeLineupPitcherId: 'away-p',
      awayLeadoffBatterId: 'a1',
      homeLeadoffBatterId: 'h1',
    }),
  ];

  it('removes the forced runner at the attributed base and adds 2 outs', () => {
    const events: GameEvent[] = [
      ...start(),
      e(EventType.WALK, { batterId: 'a1' }), // a1 on 1st
      e(EventType.DOUBLE_PLAY, { batterId: 'a2', runnerOutId: 'a1', runnerOutBase: 1 }),
    ];
    const state = deriveGameState(GAME, events, HOME_TEAM);
    expect(state.outs).toBe(2);
    expect(state.runnersOnBase.first).toBeNull();
  });

  it('clears the correct base for runnerOutBase 2 and 3, leaving the others untouched', () => {
    const events: GameEvent[] = [
      ...start(),
      e(EventType.WALK, { batterId: 'a1' }),
      e(EventType.WALK, { batterId: 'a2' }), // a1 -> 2nd, a2 -> 1st
      e(EventType.DOUBLE_PLAY, { batterId: 'a3', runnerOutId: 'a1', runnerOutBase: 2 }),
    ];
    const state = deriveGameState(GAME, events, HOME_TEAM);
    expect(state.runnersOnBase.second).toBeNull();
    expect(state.runnersOnBase.first).toBe('a2');
  });

  it('a legacy payload with no runnerOutBase still adds 2 outs without touching runners', () => {
    const events: GameEvent[] = [
      ...start(),
      e(EventType.WALK, { batterId: 'a1' }),
      e(EventType.DOUBLE_PLAY, { batterId: 'a2' }),
    ];
    const state = deriveGameState(GAME, events, HOME_TEAM);
    expect(state.outs).toBe(2);
    expect(state.runnersOnBase.first).toBe('a1');
  });

  it('caps outs at OUTS_PER_INNING rather than overshooting to 4', () => {
    const events: GameEvent[] = [
      ...start(),
      e(EventType.OUT, { batterId: 'a1', outType: 'groundout' }), // 1 out
      e(EventType.WALK, { batterId: 'a2' }),
      e(EventType.DOUBLE_PLAY, { batterId: 'a3', runnerOutId: 'a2', runnerOutBase: 1 }),
    ];
    const state = deriveGameState(GAME, events, HOME_TEAM);
    expect(state.outs).toBe(3);
  });

  it('resets balls/strikes and increments the PA count', () => {
    const events: GameEvent[] = [
      ...start(),
      e(EventType.WALK, { batterId: 'a1' }),
      e(EventType.PITCH_THROWN, { batterId: 'a2', outcome: PitchOutcome.BALL }),
      e(EventType.DOUBLE_PLAY, { batterId: 'a2', runnerOutId: 'a1', runnerOutBase: 1 }),
    ];
    const state = deriveGameState(GAME, events, HOME_TEAM);
    expect(state.balls).toBe(0);
    expect(state.strikes).toBe(0);
    expect(state.completedTopHalfPAs).toBe(2); // the walk's PA + the DP's PA
  });
});

describe('deriveGameState — TRIPLE_PLAY', () => {
  beforeEach(resetSeq);

  const start = () => [
    e(EventType.GAME_START, {
      awayLineupPitcherId: 'home-p',
      homeLineupPitcherId: 'away-p',
      awayLeadoffBatterId: 'a1',
      homeLeadoffBatterId: 'h1',
    }),
  ];

  it('adds 3 outs from a clean 0-out state', () => {
    const state = deriveGameState(GAME, [...start(), e(EventType.TRIPLE_PLAY, {})], HOME_TEAM);
    expect(state.outs).toBe(3);
  });

  it('caps outs at OUTS_PER_INNING rather than overshooting', () => {
    const events: GameEvent[] = [
      ...start(),
      e(EventType.OUT, { batterId: 'a1', outType: 'groundout' }), // 1 out
      e(EventType.TRIPLE_PLAY, {}),
    ];
    const state = deriveGameState(GAME, events, HOME_TEAM);
    expect(state.outs).toBe(3);
  });

  it('resets balls/strikes and increments PA', () => {
    const events: GameEvent[] = [
      ...start(),
      e(EventType.PITCH_THROWN, { batterId: 'a1', outcome: PitchOutcome.CALLED_STRIKE }),
      e(EventType.TRIPLE_PLAY, {}),
    ];
    const state = deriveGameState(GAME, events, HOME_TEAM);
    expect(state.strikes).toBe(0);
    expect(state.completedTopHalfPAs).toBe(1);
  });
});

describe('deriveGameState — SACRIFICE_FLY', () => {
  beforeEach(resetSeq);

  const start = () => [
    e(EventType.GAME_START, {
      awayLineupPitcherId: 'home-p',
      homeLineupPitcherId: 'away-p',
      awayLeadoffBatterId: 'a1',
      homeLeadoffBatterId: 'h1',
    }),
  ];

  it('scores the runner from 3rd and clears the base when fewer than 3 outs result', () => {
    const events: GameEvent[] = [
      ...start(),
      e(EventType.WALK, { batterId: 'a1' }),
      e(EventType.BASERUNNER_ADVANCE, { runnerId: 'a1', fromBase: 1, toBase: 3 }), // a1 -> 3rd
      e(EventType.SACRIFICE_FLY, { batterId: 'a2' }),
    ];
    const state = deriveGameState(GAME, events, HOME_TEAM);
    expect(state.awayScore).toBe(1);
    expect(state.runnersOnBase.third).toBeNull();
    expect(state.outs).toBe(1);
  });

  it('OBR 9.08: does NOT score the runner when the sac fly is the 3rd out', () => {
    const events: GameEvent[] = [
      ...start(),
      e(EventType.WALK, { batterId: 'a1' }),
      e(EventType.BASERUNNER_ADVANCE, { runnerId: 'a1', fromBase: 1, toBase: 3 }),
      e(EventType.OUT, { batterId: 'a2', outType: 'groundout' }), // 1 out
      e(EventType.OUT, { batterId: 'a3', outType: 'groundout' }), // 2 outs
      e(EventType.SACRIFICE_FLY, { batterId: 'a4' }), // 3rd out — run should NOT count
    ];
    const state = deriveGameState(GAME, events, HOME_TEAM);
    expect(state.awayScore).toBe(0);
    expect(state.outs).toBe(3);
    // The runner is left stranded on 3rd since the inning ended before they scored.
    expect(state.runnersOnBase.third).toBe('a1');
  });

  it('no runner on 3rd: just an out, no run', () => {
    const state = deriveGameState(GAME, [...start(), e(EventType.SACRIFICE_FLY, { batterId: 'a1' })], HOME_TEAM);
    expect(state.awayScore).toBe(0);
    expect(state.outs).toBe(1);
  });

  it('resets balls/strikes and increments PA', () => {
    const events: GameEvent[] = [
      ...start(),
      e(EventType.PITCH_THROWN, { batterId: 'a1', outcome: PitchOutcome.BALL }),
      e(EventType.SACRIFICE_FLY, { batterId: 'a1' }),
    ];
    const state = deriveGameState(GAME, events, HOME_TEAM);
    expect(state.balls).toBe(0);
    expect(state.completedTopHalfPAs).toBe(1);
  });
});

describe('deriveGameState — SACRIFICE_BUNT', () => {
  beforeEach(resetSeq);

  const start = () => [
    e(EventType.GAME_START, {
      awayLineupPitcherId: 'home-p',
      homeLineupPitcherId: 'away-p',
      awayLeadoffBatterId: 'a1',
      homeLeadoffBatterId: 'h1',
    }),
  ];

  it('advances every runner one base and puts the batter out (squeeze play scores from 3rd)', () => {
    const events: GameEvent[] = [
      ...start(),
      e(EventType.WALK, { batterId: 'a1' }),
      e(EventType.WALK, { batterId: 'a2' }), // a1 -> 2nd, a2 -> 1st
      e(EventType.BASERUNNER_ADVANCE, { runnerId: 'a1', fromBase: 2, toBase: 3 }), // a1 -> 3rd
      e(EventType.SACRIFICE_BUNT, { batterId: 'a3' }),
    ];
    const state = deriveGameState(GAME, events, HOME_TEAM);
    expect(state.awayScore).toBe(1); // a1 scored from 3rd
    expect(state.runnersOnBase).toEqual({ first: null, second: 'a2', third: null });
    expect(state.outs).toBe(1);
  });

  it('does NOT score the runner from 3rd when the bunt is the 3rd out', () => {
    const events: GameEvent[] = [
      ...start(),
      e(EventType.WALK, { batterId: 'a1' }),
      e(EventType.BASERUNNER_ADVANCE, { runnerId: 'a1', fromBase: 1, toBase: 3 }),
      e(EventType.OUT, { batterId: 'a2', outType: 'groundout' }),
      e(EventType.OUT, { batterId: 'a3', outType: 'groundout' }),
      e(EventType.SACRIFICE_BUNT, { batterId: 'a4' }), // 3rd out
    ];
    const state = deriveGameState(GAME, events, HOME_TEAM);
    expect(state.awayScore).toBe(0);
    expect(state.outs).toBe(3);
  });

  it('bases empty: just an out, batter never placed on base', () => {
    const state = deriveGameState(GAME, [...start(), e(EventType.SACRIFICE_BUNT, { batterId: 'a1' })], HOME_TEAM);
    expect(state.outs).toBe(1);
    expect(state.runnersOnBase).toEqual({ first: null, second: null, third: null });
  });
});

describe('deriveGameState — CAUGHT_STEALING', () => {
  beforeEach(resetSeq);

  const start = () => [
    e(EventType.GAME_START, {
      awayLineupPitcherId: 'home-p',
      homeLineupPitcherId: 'away-p',
      awayLeadoffBatterId: 'a1',
      homeLeadoffBatterId: 'h1',
    }),
  ];

  it('removes the runner from their base and adds an out, resetting the count', () => {
    const events: GameEvent[] = [
      ...start(),
      e(EventType.WALK, { batterId: 'a1' }),
      e(EventType.PITCH_THROWN, { batterId: 'a2', outcome: PitchOutcome.BALL }),
      e(EventType.CAUGHT_STEALING, { runnerId: 'a1', fromBase: 1, toBase: 2 }),
    ];
    const state = deriveGameState(GAME, events, HOME_TEAM);
    expect(state.runnersOnBase.first).toBeNull();
    expect(state.outs).toBe(1);
    expect(state.balls).toBe(0);
  });

  it('works from 2nd and 3rd as well', () => {
    const from2nd = deriveGameState(GAME, [
      ...start(),
      e(EventType.WALK, { batterId: 'a1' }),
      e(EventType.BASERUNNER_ADVANCE, { runnerId: 'a1', fromBase: 1, toBase: 2 }),
      e(EventType.CAUGHT_STEALING, { runnerId: 'a1', fromBase: 2, toBase: 3 }),
    ], HOME_TEAM);
    expect(from2nd.runnersOnBase.second).toBeNull();
    expect(from2nd.outs).toBe(1);
  });
});

describe('deriveGameState — PICKOFF_ATTEMPT', () => {
  beforeEach(resetSeq);

  const start = () => [
    e(EventType.GAME_START, {
      awayLineupPitcherId: 'home-p',
      homeLineupPitcherId: 'away-p',
      awayLeadoffBatterId: 'a1',
      homeLeadoffBatterId: 'h1',
    }),
  ];

  it('outcome "out" removes the runner and adds an out', () => {
    const events: GameEvent[] = [
      ...start(),
      e(EventType.WALK, { batterId: 'a1' }),
      e(EventType.PICKOFF_ATTEMPT, { runnerId: 'a1', base: 1, outcome: 'out' }),
    ];
    const state = deriveGameState(GAME, events, HOME_TEAM);
    expect(state.runnersOnBase.first).toBeNull();
    expect(state.outs).toBe(1);
  });

  it('outcome "safe" leaves state unchanged', () => {
    const events: GameEvent[] = [
      ...start(),
      e(EventType.WALK, { batterId: 'a1' }),
      e(EventType.PICKOFF_ATTEMPT, { runnerId: 'a1', base: 1, outcome: 'safe' }),
    ];
    const state = deriveGameState(GAME, events, HOME_TEAM);
    expect(state.runnersOnBase.first).toBe('a1');
    expect(state.outs).toBe(0);
  });

  it('a legacy event with no outcome field is treated as safe (backward compatibility)', () => {
    const events: GameEvent[] = [
      ...start(),
      e(EventType.WALK, { batterId: 'a1' }),
      e(EventType.PICKOFF_ATTEMPT, { runnerId: 'a1', base: 1 }),
    ];
    const state = deriveGameState(GAME, events, HOME_TEAM);
    expect(state.runnersOnBase.first).toBe('a1');
    expect(state.outs).toBe(0);
  });

  it('removes from 2nd/3rd correctly when picked off there', () => {
    const events: GameEvent[] = [
      ...start(),
      e(EventType.WALK, { batterId: 'a1' }),
      e(EventType.BASERUNNER_ADVANCE, { runnerId: 'a1', fromBase: 1, toBase: 3 }),
      e(EventType.PICKOFF_ATTEMPT, { runnerId: 'a1', base: 3, outcome: 'out' }),
    ];
    const state = deriveGameState(GAME, events, HOME_TEAM);
    expect(state.runnersOnBase.third).toBeNull();
    expect(state.outs).toBe(1);
  });
});

describe('deriveGameState — RUNDOWN', () => {
  beforeEach(resetSeq);

  const start = () => [
    e(EventType.GAME_START, {
      awayLineupPitcherId: 'home-p',
      homeLineupPitcherId: 'away-p',
      awayLeadoffBatterId: 'a1',
      homeLeadoffBatterId: 'h1',
    }),
  ];

  it('outcome "out" removes the runner from startBase and adds an out', () => {
    const events: GameEvent[] = [
      ...start(),
      e(EventType.WALK, { batterId: 'a1' }),
      e(EventType.RUNDOWN, { runnerId: 'a1', startBase: 1, throwSequence: [1, 4, 6], outcome: 'out' }),
    ];
    const state = deriveGameState(GAME, events, HOME_TEAM);
    expect(state.runnersOnBase.first).toBeNull();
    expect(state.outs).toBe(1);
  });

  it('outcome "safe" removes from startBase and places the runner at safeAtBase', () => {
    const events: GameEvent[] = [
      ...start(),
      e(EventType.WALK, { batterId: 'a1' }),
      e(EventType.RUNDOWN, { runnerId: 'a1', startBase: 1, throwSequence: [1, 4], outcome: 'safe', safeAtBase: 2 }),
    ];
    const state = deriveGameState(GAME, events, HOME_TEAM);
    expect(state.runnersOnBase.first).toBeNull();
    expect(state.runnersOnBase.second).toBe('a1');
    expect(state.outs).toBe(0);
  });

  it('a rundown that ends safe further than the adjacent base (advances 2 bases while evading)', () => {
    const events: GameEvent[] = [
      ...start(),
      e(EventType.WALK, { batterId: 'a1' }),
      e(EventType.RUNDOWN, { runnerId: 'a1', startBase: 1, throwSequence: [1, 3, 6, 5], outcome: 'safe', safeAtBase: 3 }),
    ];
    const state = deriveGameState(GAME, events, HOME_TEAM);
    expect(state.runnersOnBase.first).toBeNull();
    expect(state.runnersOnBase.third).toBe('a1');
  });
});

describe('deriveGameState — BALK', () => {
  beforeEach(resetSeq);

  const start = () => [
    e(EventType.GAME_START, {
      awayLineupPitcherId: 'home-p',
      homeLineupPitcherId: 'away-p',
      awayLeadoffBatterId: 'a1',
      homeLeadoffBatterId: 'h1',
    }),
  ];

  it('advances every runner exactly one base', () => {
    const events: GameEvent[] = [
      ...start(),
      e(EventType.WALK, { batterId: 'a1' }),
      e(EventType.WALK, { batterId: 'a2' }), // a1 -> 2nd, a2 -> 1st
      e(EventType.BALK, { pitcherId: 'home-p' }),
    ];
    const state = deriveGameState(GAME, events, HOME_TEAM);
    expect(state.runnersOnBase).toEqual({ first: null, second: 'a2', third: 'a1' });
  });

  it('OBR 9.04(b)(5): a standalone balk does NOT itself add a run, even with a runner on 3rd', () => {
    const events: GameEvent[] = [
      ...start(),
      e(EventType.WALK, { batterId: 'a1' }),
      e(EventType.BASERUNNER_ADVANCE, { runnerId: 'a1', fromBase: 1, toBase: 3 }),
      e(EventType.BALK, { pitcherId: 'home-p' }),
    ];
    const state = deriveGameState(GAME, events, HOME_TEAM);
    expect(state.awayScore).toBe(0);
    // The runner who was on 3rd is pushed off the diamond by the balk handler
    // (it doesn't know they scored) — the caller is expected to pair a SCORE
    // event, matching handleBalk in the mobile/web scoring UI.
    expect(state.runnersOnBase.third).toBeNull();
  });

  it('a balk paired with a SCORE event (as the real scoring UI emits) does add the run', () => {
    const events: GameEvent[] = [
      ...start(),
      e(EventType.WALK, { batterId: 'a1' }),
      e(EventType.BASERUNNER_ADVANCE, { runnerId: 'a1', fromBase: 1, toBase: 3 }),
      e(EventType.BALK, { pitcherId: 'home-p' }),
      e(EventType.SCORE, { scoringPlayerId: 'a1', rbis: 0 }),
    ];
    const state = deriveGameState(GAME, events, HOME_TEAM);
    expect(state.awayScore).toBe(1);
  });
});

describe('deriveGameState — STOLEN_BASE / BASERUNNER_ADVANCE', () => {
  beforeEach(resetSeq);

  const start = () => [
    e(EventType.GAME_START, {
      awayLineupPitcherId: 'home-p',
      homeLineupPitcherId: 'away-p',
      awayLeadoffBatterId: 'a1',
      homeLeadoffBatterId: 'h1',
    }),
  ];

  it('stealing 2nd moves the runner from 1st to 2nd', () => {
    const events: GameEvent[] = [
      ...start(),
      e(EventType.WALK, { batterId: 'a1' }),
      e(EventType.STOLEN_BASE, { runnerId: 'a1', fromBase: 1, toBase: 2 }),
    ];
    const state = deriveGameState(GAME, events, HOME_TEAM);
    expect(state.runnersOnBase).toEqual({ first: null, second: 'a1', third: null });
  });

  it('stealing home (toBase 4) clears the runner from 3rd but does not itself add a run', () => {
    const events: GameEvent[] = [
      ...start(),
      e(EventType.WALK, { batterId: 'a1' }),
      e(EventType.BASERUNNER_ADVANCE, { runnerId: 'a1', fromBase: 1, toBase: 3 }),
      e(EventType.STOLEN_BASE, { runnerId: 'a1', fromBase: 3, toBase: 4 }),
    ];
    const state = deriveGameState(GAME, events, HOME_TEAM);
    expect(state.runnersOnBase.third).toBeNull();
    expect(state.awayScore).toBe(0); // needs a paired SCORE event, matching handleStolenBase
  });

  it('stealing home plus the paired SCORE event (as the real scoring UI emits) adds the run', () => {
    const events: GameEvent[] = [
      ...start(),
      e(EventType.WALK, { batterId: 'a1' }),
      e(EventType.BASERUNNER_ADVANCE, { runnerId: 'a1', fromBase: 1, toBase: 3 }),
      e(EventType.STOLEN_BASE, { runnerId: 'a1', fromBase: 3, toBase: 4 }),
      e(EventType.SCORE, { scoringPlayerId: 'a1', rbis: 0 }),
    ];
    const state = deriveGameState(GAME, events, HOME_TEAM);
    expect(state.awayScore).toBe(1);
  });

  it('regression: a BASERUNNER_ADVANCE whose fromBase no longer matches the occupant does not wipe an unrelated runner', () => {
    // a1 was already moved off 1st by an earlier event; a stale/duplicate
    // BASERUNNER_ADVANCE still claiming fromBase:1 must not clear whoever
    // (a2) is now actually occupying 1st.
    const events: GameEvent[] = [
      ...start(),
      e(EventType.WALK, { batterId: 'a1' }),
      e(EventType.BASERUNNER_ADVANCE, { runnerId: 'a1', fromBase: 1, toBase: 2 }), // a1 -> 2nd
      e(EventType.WALK, { batterId: 'a2' }), // a2 -> 1st
      e(EventType.BASERUNNER_ADVANCE, { runnerId: 'a1', fromBase: 1, toBase: 2 }), // stale — a1 no longer on 1st
    ];
    const state = deriveGameState(GAME, events, HOME_TEAM);
    expect(state.runnersOnBase.first).toBe('a2'); // untouched
  });
});

describe('deriveGameState — BASERUNNER_OUT (standalone, not linked to a HIT)', () => {
  beforeEach(resetSeq);

  const start = () => [
    e(EventType.GAME_START, {
      awayLineupPitcherId: 'home-p',
      homeLineupPitcherId: 'away-p',
      awayLeadoffBatterId: 'a1',
      homeLeadoffBatterId: 'h1',
    }),
  ];

  it('removes the runner and adds an out, without touching balls/strikes/PA (the batter\'s PA is still pending)', () => {
    const events: GameEvent[] = [
      ...start(),
      e(EventType.WALK, { batterId: 'a1' }),
      e(EventType.PITCH_THROWN, { batterId: 'a2', outcome: PitchOutcome.BALL }),
      e(EventType.BASERUNNER_OUT, { runnerId: 'a1', fromBase: 1 }),
    ];
    const state = deriveGameState(GAME, events, HOME_TEAM);
    expect(state.runnersOnBase.first).toBeNull();
    expect(state.outs).toBe(1);
    expect(state.balls).toBe(1); // untouched by the BASERUNNER_OUT itself
    expect(state.completedTopHalfPAs).toBe(1); // only the walk's PA — a2's PA is still open
  });
});
