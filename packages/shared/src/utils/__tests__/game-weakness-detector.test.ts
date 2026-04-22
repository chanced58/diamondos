import {
  EventType,
  PitchOutcome,
  PitchType,
} from '../../types/game-event';
import type { GameEvent } from '../../types/game-event';
import { WeaknessCode } from '../../types/weakness';
import {
  detectWeaknesses,
  WEAKNESS_THRESHOLDS,
} from '../game-weakness-detector';

let sequenceCounter = 0;

function event(overrides: Partial<GameEvent> & { eventType: EventType }): GameEvent {
  sequenceCounter += 1;
  return {
    id: `evt-${sequenceCounter}`,
    gameId: 'game-1',
    sequenceNumber: sequenceCounter,
    inning: 1,
    isTopOfInning: true,
    payload: {},
    occurredAt: '2026-04-22T18:00:00Z',
    createdBy: 'user-1',
    deviceId: 'device-1',
    ...overrides,
  };
}

const OUR_PLAYERS = new Set(['p-us-1', 'p-us-2', 'p-us-3']);
const CTX = { ourPlayerIds: OUR_PLAYERS };

beforeEach(() => {
  sequenceCounter = 0;
});

describe('detectWeaknesses — k_vs_offspeed', () => {
  it('fires when at least kVsOffspeedMin Ks come on off-speed AND the ratio exceeds threshold', () => {
    const events: GameEvent[] = [];
    // 5 total strikeouts; 4 immediately preceded by an off-speed pitch.
    for (let i = 0; i < 5; i++) {
      events.push(
        event({
          eventType: EventType.PITCH_THROWN,
          payload: {
            outcome: PitchOutcome.SWINGING_STRIKE,
            pitchType: i < 4 ? PitchType.CURVEBALL : PitchType.FASTBALL,
            batterId: 'p-us-1',
          },
        }),
      );
      events.push(event({ eventType: EventType.STRIKEOUT, payload: { batterId: 'p-us-1' } }));
    }
    const signals = detectWeaknesses(events, CTX);
    const signal = signals.find((s) => s.code === WeaknessCode.K_VS_OFFSPEED);
    expect(signal).toBeDefined();
    expect(signal!.evidence.value).toBe(4);
  });

  it('does not fire when only one K was on off-speed', () => {
    const events: GameEvent[] = [];
    for (let i = 0; i < 5; i++) {
      events.push(
        event({
          eventType: EventType.PITCH_THROWN,
          payload: {
            outcome: PitchOutcome.SWINGING_STRIKE,
            pitchType: i === 0 ? PitchType.CURVEBALL : PitchType.FASTBALL,
            batterId: 'p-us-1',
          },
        }),
      );
      events.push(event({ eventType: EventType.STRIKEOUT, payload: { batterId: 'p-us-1' } }));
    }
    const signals = detectWeaknesses(events, CTX);
    expect(signals.find((s) => s.code === WeaknessCode.K_VS_OFFSPEED)).toBeUndefined();
  });

  it('ignores opposing-batter strikeouts', () => {
    const events: GameEvent[] = [];
    for (let i = 0; i < 5; i++) {
      events.push(
        event({
          eventType: EventType.PITCH_THROWN,
          payload: {
            outcome: PitchOutcome.SWINGING_STRIKE,
            pitchType: PitchType.CURVEBALL,
            pitcherId: 'p-us-1', // our pitcher
            opponentBatterId: 'opp-1',
          },
        }),
      );
      events.push(
        event({
          eventType: EventType.STRIKEOUT,
          payload: { pitcherId: 'p-us-1', opponentBatterId: 'opp-1' },
        }),
      );
    }
    const signals = detectWeaknesses(events, CTX);
    expect(signals.find((s) => s.code === WeaknessCode.K_VS_OFFSPEED)).toBeUndefined();
  });
});

describe('detectWeaknesses — two_strike_approach', () => {
  function twoStrikePA(outcome: EventType, batterId = 'p-us-1'): GameEvent[] {
    return [
      event({
        eventType: EventType.PITCH_THROWN,
        payload: { outcome: PitchOutcome.CALLED_STRIKE, batterId },
      }),
      event({
        eventType: EventType.PITCH_THROWN,
        payload: { outcome: PitchOutcome.SWINGING_STRIKE, batterId },
      }),
      event({ eventType: outcome, payload: { batterId } }),
    ];
  }

  it('fires when 2-strike K rate exceeds threshold', () => {
    const events: GameEvent[] = [];
    for (let i = 0; i < 5; i++) events.push(...twoStrikePA(EventType.STRIKEOUT));
    events.push(...twoStrikePA(EventType.HIT));
    const signals = detectWeaknesses(events, CTX);
    const s = signals.find((x) => x.code === WeaknessCode.TWO_STRIKE_APPROACH);
    expect(s).toBeDefined();
  });

  it('does not fire with too few 2-strike PAs', () => {
    const events = twoStrikePA(EventType.STRIKEOUT);
    const signals = detectWeaknesses(events, CTX);
    expect(signals.find((s) => s.code === WeaknessCode.TWO_STRIKE_APPROACH)).toBeUndefined();
  });

  it('ignores PAs that never reached 2 strikes', () => {
    const events: GameEvent[] = [];
    for (let i = 0; i < 5; i++) {
      events.push(
        event({
          eventType: EventType.PITCH_THROWN,
          payload: { outcome: PitchOutcome.BALL, batterId: 'p-us-1' },
        }),
      );
      events.push(event({ eventType: EventType.WALK, payload: { batterId: 'p-us-1' } }));
    }
    const signals = detectWeaknesses(events, CTX);
    expect(signals.find((s) => s.code === WeaknessCode.TWO_STRIKE_APPROACH)).toBeUndefined();
  });
});

describe('detectWeaknesses — defensive_errors', () => {
  it('fires on ≥ errorsInGame FIELD_ERROR events committed while we were fielding', () => {
    const events: GameEvent[] = [];
    for (let i = 0; i < WEAKNESS_THRESHOLDS.errorsInGame; i++) {
      // We were fielding → our pitcher + opponent batter on the event.
      events.push(
        event({
          eventType: EventType.FIELD_ERROR,
          payload: { pitcherId: 'p-us-1', opponentBatterId: 'opp-1' },
        }),
      );
    }
    const signals = detectWeaknesses(events, CTX);
    expect(signals.find((s) => s.code === WeaknessCode.DEFENSIVE_ERRORS)).toBeDefined();
  });

  it('does NOT fire for errors committed while the opponent was fielding (we benefited)', () => {
    const events: GameEvent[] = [];
    for (let i = 0; i < WEAKNESS_THRESHOLDS.errorsInGame + 2; i++) {
      // We were batting → opponent pitcher + our batter.
      events.push(
        event({
          eventType: EventType.FIELD_ERROR,
          payload: { opponentPitcherId: 'opp-p-1', batterId: 'p-us-1' },
        }),
      );
    }
    const signals = detectWeaknesses(events, CTX);
    expect(signals.find((s) => s.code === WeaknessCode.DEFENSIVE_ERRORS)).toBeUndefined();
  });

  it('does not fire below threshold', () => {
    const events = [
      event({
        eventType: EventType.FIELD_ERROR,
        payload: { pitcherId: 'p-us-1', opponentBatterId: 'opp-1' },
      }),
    ];
    const signals = detectWeaknesses(events, CTX);
    expect(signals.find((s) => s.code === WeaknessCode.DEFENSIVE_ERRORS)).toBeUndefined();
  });
});

describe('detectWeaknesses — walks_issued', () => {
  it('fires when our staff issued ≥ threshold walks', () => {
    const events: GameEvent[] = [];
    for (let i = 0; i < WEAKNESS_THRESHOLDS.walksIssued; i++) {
      events.push(
        event({
          eventType: EventType.WALK,
          payload: { pitcherId: 'p-us-1', opponentBatterId: 'opp-1' },
        }),
      );
    }
    const signals = detectWeaknesses(events, CTX);
    expect(signals.find((s) => s.code === WeaknessCode.WALKS_ISSUED)).toBeDefined();
  });

  it('does not fire for walks where our batters walked', () => {
    const events: GameEvent[] = [];
    for (let i = 0; i < WEAKNESS_THRESHOLDS.walksIssued; i++) {
      events.push(event({ eventType: EventType.WALK, payload: { batterId: 'p-us-1' } }));
    }
    const signals = detectWeaknesses(events, CTX);
    expect(signals.find((s) => s.code === WeaknessCode.WALKS_ISSUED)).toBeUndefined();
  });
});

describe('detectWeaknesses — left_on_base', () => {
  it('fires when LOB ≥ threshold', () => {
    // 10 hits, 2 scores, distributed across multiple half-innings.
    const events: GameEvent[] = [];
    for (let inning = 1; inning <= 5; inning++) {
      for (let i = 0; i < 2; i++) {
        events.push(
          event({
            eventType: EventType.HIT,
            inning,
            isTopOfInning: true,
            payload: { batterId: 'p-us-1', hitType: 'single' },
          }),
        );
      }
    }
    // Only 2 scores total.
    events.push(event({ eventType: EventType.SCORE, inning: 1, payload: { scoringPlayerId: 'p-us-1', rbis: 1 } }));
    events.push(event({ eventType: EventType.SCORE, inning: 2, payload: { scoringPlayerId: 'p-us-2', rbis: 1 } }));

    const signals = detectWeaknesses(events, CTX);
    expect(signals.find((s) => s.code === WeaknessCode.LEFT_ON_BASE)).toBeDefined();
  });

  it('does not fire when LOB below threshold', () => {
    const events: GameEvent[] = [];
    for (let i = 0; i < 3; i++) {
      events.push(event({ eventType: EventType.HIT, payload: { batterId: 'p-us-1', hitType: 'single' } }));
    }
    const signals = detectWeaknesses(events, CTX);
    expect(signals.find((s) => s.code === WeaknessCode.LEFT_ON_BASE)).toBeUndefined();
  });
});

describe('detectWeaknesses — sorting', () => {
  it('returns signals sorted by score desc', () => {
    // Build a game with multiple weaknesses — verify sort.
    const events: GameEvent[] = [];
    // Trip walks
    for (let i = 0; i < WEAKNESS_THRESHOLDS.walksIssued; i++) {
      events.push(
        event({
          eventType: EventType.WALK,
          payload: { pitcherId: 'p-us-1', opponentBatterId: 'opp-1' },
        }),
      );
    }
    // Trip errors (while we were fielding)
    for (let i = 0; i < WEAKNESS_THRESHOLDS.errorsInGame + 1; i++) {
      events.push(
        event({
          eventType: EventType.FIELD_ERROR,
          payload: { pitcherId: 'p-us-1', opponentBatterId: 'opp-1' },
        }),
      );
    }
    const signals = detectWeaknesses(events, CTX);
    expect(signals.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < signals.length; i++) {
      expect(signals[i - 1].score).toBeGreaterThanOrEqual(signals[i].score);
    }
  });

  it('returns empty array for a clean game', () => {
    const events = [event({ eventType: EventType.GAME_START })];
    expect(detectWeaknesses(events, CTX)).toEqual([]);
  });
});
