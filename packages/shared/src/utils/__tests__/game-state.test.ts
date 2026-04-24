import { deriveGameState } from '../game-state';
import {
  EventType,
  HitType,
  PitchOutcome,
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
