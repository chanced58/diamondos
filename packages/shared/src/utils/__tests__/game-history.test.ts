import {
  buildGameHistoryTree,
  formatEventLabel,
  getEventCategory,
} from '../game-history';
import {
  EventType,
  PitchOutcome,
  HitType,
  type GameEvent,
} from '../../types/game-event';

let seq = 0;
const mkEvent = (eventType: EventType, payload: Record<string, unknown>, opts: Partial<GameEvent> = {}): GameEvent => ({
  id: `evt-${seq}`,
  gameId: 'g1',
  sequenceNumber: seq++,
  eventType,
  inning: 1,
  isTopOfInning: true,
  payload,
  occurredAt: new Date(2026, 0, 1, 12, 0, seq).toISOString(),
  createdBy: 'user-1',
  deviceId: 'dev-1',
  ...opts,
});
const resetSeq = () => { seq = 0; };

const players = new Map<string, string>([
  ['p1', 'Alice Atbat'],
  ['p2', 'Bob Basher'],
  ['pit1', 'Paul Pitcher'],
]);

describe('buildGameHistoryTree — DROPPED_THIRD_STRIKE rendering', () => {
  beforeEach(resetSeq);

  it('renders DROPPED_THIRD_STRIKE (thrown_out) as a terminal out in the at-bat', () => {
    const events: GameEvent[] = [
      mkEvent(EventType.GAME_START, {}),
      mkEvent(EventType.PITCH_THROWN, { pitcherId: 'pit1', batterId: 'p1', outcome: PitchOutcome.SWINGING_STRIKE }),
      mkEvent(EventType.PITCH_THROWN, { pitcherId: 'pit1', batterId: 'p1', outcome: PitchOutcome.SWINGING_STRIKE }),
      mkEvent(EventType.PITCH_THROWN, { pitcherId: 'pit1', batterId: 'p1', outcome: PitchOutcome.SWINGING_STRIKE }),
      mkEvent(EventType.DROPPED_THIRD_STRIKE, {
        batterId: 'p1',
        pitcherId: 'pit1',
        outcome: 'thrown_out',
        fieldingSequence: [2, 3],
      }),
    ];

    const tree = buildGameHistoryTree(events, players);

    expect(tree.innings).toHaveLength(1);
    const top = tree.innings[0].top!;
    expect(top.items).toHaveLength(1);
    const atBat = top.items[0];
    expect(atBat.type).toBe('at-bat');
    if (atBat.type !== 'at-bat') throw new Error('expected at-bat');
    expect(atBat.result).not.toBeNull();
    expect(atBat.result!.event.eventType).toBe(EventType.DROPPED_THIRD_STRIKE);
    expect(atBat.result!.label).toContain('Dropped');
    expect(atBat.result!.category).toBe('negative');
    // No base advancement
    expect(top.homeScore).toBe(0);
    expect(top.awayScore).toBe(0);
  });

  it('renders DROPPED_THIRD_STRIKE (reached_on_error) as a terminal reach, batter on first', () => {
    const events: GameEvent[] = [
      mkEvent(EventType.GAME_START, {}),
      mkEvent(EventType.PITCH_THROWN, { pitcherId: 'pit1', batterId: 'p1', outcome: PitchOutcome.SWINGING_STRIKE }),
      mkEvent(EventType.DROPPED_THIRD_STRIKE, {
        batterId: 'p1',
        pitcherId: 'pit1',
        outcome: 'reached_on_error',
        errorBy: 2,
      }),
      // Next batter singles to force the D3K runner around
      mkEvent(EventType.PITCH_THROWN, { pitcherId: 'pit1', batterId: 'p2', outcome: PitchOutcome.IN_PLAY }),
      mkEvent(EventType.HIT, { batterId: 'p2', pitcherId: 'pit1', hitType: HitType.HOME_RUN, rbis: 2 }),
    ];

    const tree = buildGameHistoryTree(events, players);
    const top = tree.innings[0].top!;
    // HR with one runner on = 2 runs
    expect(top.awayScore).toBe(2);
    expect(top.items).toHaveLength(2);
    const d3k = top.items[0];
    if (d3k.type !== 'at-bat') throw new Error('expected at-bat');
    expect(d3k.result!.event.eventType).toBe(EventType.DROPPED_THIRD_STRIKE);
    expect(d3k.result!.category).toBe('positive');
  });

  it('formatEventLabel returns a readable label for DROPPED_THIRD_STRIKE variants', () => {
    const thrownOut = mkEvent(EventType.DROPPED_THIRD_STRIKE, {
      batterId: 'p1', outcome: 'thrown_out', fieldingSequence: [2, 3],
    });
    const reachedErr = mkEvent(EventType.DROPPED_THIRD_STRIKE, {
      batterId: 'p1', outcome: 'reached_on_error', errorBy: 2,
    });
    const reachedWp = mkEvent(EventType.DROPPED_THIRD_STRIKE, {
      batterId: 'p1', outcome: 'reached_wild_pitch', isWildPitch: true,
    });
    expect(formatEventLabel(thrownOut, players)).toMatch(/Dropped.*Strike/i);
    expect(formatEventLabel(thrownOut, players)).toMatch(/C-1B|2-3/);
    expect(formatEventLabel(reachedErr, players)).toMatch(/Dropped.*Strike/i);
    expect(formatEventLabel(reachedErr, players)).toMatch(/error/i);
    expect(formatEventLabel(reachedWp, players)).toMatch(/Dropped.*Strike/i);
  });
});

describe('buildGameHistoryTree — CATCHER_INTERFERENCE rendering', () => {
  beforeEach(resetSeq);

  it('renders CATCHER_INTERFERENCE as a terminal reach, batter on first', () => {
    const events: GameEvent[] = [
      mkEvent(EventType.GAME_START, {}),
      mkEvent(EventType.PITCH_THROWN, { pitcherId: 'pit1', batterId: 'p1', outcome: PitchOutcome.IN_PLAY }),
      mkEvent(EventType.CATCHER_INTERFERENCE, { batterId: 'p1', pitcherId: 'pit1' }),
      // Force run with bases-loaded reach
      mkEvent(EventType.PITCH_THROWN, { pitcherId: 'pit1', batterId: 'p2', outcome: PitchOutcome.IN_PLAY }),
      mkEvent(EventType.HIT, { batterId: 'p2', pitcherId: 'pit1', hitType: HitType.HOME_RUN, rbis: 2 }),
    ];

    const tree = buildGameHistoryTree(events, players);
    const top = tree.innings[0].top!;
    expect(top.items).toHaveLength(2);
    const ci = top.items[0];
    if (ci.type !== 'at-bat') throw new Error('expected at-bat');
    expect(ci.result!.event.eventType).toBe(EventType.CATCHER_INTERFERENCE);
    expect(ci.result!.category).toBe('positive');
    // CI runner scored on HR → 2 runs total
    expect(top.awayScore).toBe(2);
  });

  it('formatEventLabel returns a readable label for CATCHER_INTERFERENCE', () => {
    const event = mkEvent(EventType.CATCHER_INTERFERENCE, { batterId: 'p1', pitcherId: 'pit1' });
    expect(formatEventLabel(event, players)).toMatch(/Catcher Interference/i);
  });

  it('forces runners home on a bases-loaded CATCHER_INTERFERENCE', () => {
    // Seed bases by hitting three singles, then CI forces home from 3rd.
    const events: GameEvent[] = [
      mkEvent(EventType.GAME_START, {}),
      mkEvent(EventType.PITCH_THROWN, { pitcherId: 'pit1', batterId: 'p1', outcome: PitchOutcome.IN_PLAY }),
      mkEvent(EventType.HIT, { batterId: 'p1', pitcherId: 'pit1', hitType: HitType.SINGLE }),
      mkEvent(EventType.PITCH_THROWN, { pitcherId: 'pit1', batterId: 'p2', outcome: PitchOutcome.IN_PLAY }),
      mkEvent(EventType.HIT, { batterId: 'p2', pitcherId: 'pit1', hitType: HitType.SINGLE }),
      mkEvent(EventType.PITCH_THROWN, { pitcherId: 'pit1', batterId: 'p1', outcome: PitchOutcome.IN_PLAY }),
      mkEvent(EventType.HIT, { batterId: 'p1', pitcherId: 'pit1', hitType: HitType.SINGLE }),
      // Bases loaded — CI forces runner from 3rd to score
      mkEvent(EventType.PITCH_THROWN, { pitcherId: 'pit1', batterId: 'p2', outcome: PitchOutcome.IN_PLAY }),
      mkEvent(EventType.CATCHER_INTERFERENCE, { batterId: 'p2', pitcherId: 'pit1' }),
    ];

    const tree = buildGameHistoryTree(events, players);
    const top = tree.innings[0].top!;
    // 4 at-bats; the CI is terminal + positive
    expect(top.items.length).toBe(4);
    const ci = top.items[3];
    expect(ci.type).toBe('at-bat');
    if (ci.type !== 'at-bat') throw new Error('expected at-bat');
    expect(ci.result!.event.eventType).toBe(EventType.CATCHER_INTERFERENCE);
    expect(ci.result!.category).toBe('positive');
    // CI with bases loaded = 1 forced run
    expect(top.awayScore).toBe(1);
  });
});

describe('buildGameHistoryTree — D3K reached_on_error force advance', () => {
  beforeEach(resetSeq);

  it('pushes an existing runner from 1st to 2nd when the batter reaches on D3K', () => {
    const events: GameEvent[] = [
      mkEvent(EventType.GAME_START, {}),
      mkEvent(EventType.PITCH_THROWN, { pitcherId: 'pit1', batterId: 'p1', outcome: PitchOutcome.IN_PLAY }),
      mkEvent(EventType.HIT, { batterId: 'p1', pitcherId: 'pit1', hitType: HitType.SINGLE }),
      // Now p1 on 1st. D3K reached_on_error for p2 should push p1 to 2nd,
      // not silently overwrite r1 and lose p1.
      mkEvent(EventType.PITCH_THROWN, { pitcherId: 'pit1', batterId: 'p2', outcome: PitchOutcome.SWINGING_STRIKE }),
      mkEvent(EventType.DROPPED_THIRD_STRIKE, {
        batterId: 'p2',
        pitcherId: 'pit1',
        outcome: 'reached_on_error',
        errorBy: 2,
      }),
      // p3 homers — should score both p1 (pushed to 2nd) and p2 (on 1st) + batter = 3 runs
      mkEvent(EventType.PITCH_THROWN, { pitcherId: 'pit1', batterId: 'p2', outcome: PitchOutcome.IN_PLAY }),
      mkEvent(EventType.HIT, { batterId: 'p2', pitcherId: 'pit1', hitType: HitType.HOME_RUN, rbis: 3 }),
    ];

    const tree = buildGameHistoryTree(events, players);
    // 3 runs confirms forceAdvance was applied (otherwise p1 would've been
    // overwritten and HR would score only 2 runs — HR batter + p2).
    expect(tree.innings[0].top!.awayScore).toBe(3);
  });
});

describe('buildGameHistoryTree — defensive default case', () => {
  beforeEach(resetSeq);

  it('renders an unknown event type as an interstitial rather than silently dropping it', () => {
    const unknown = mkEvent('some_future_type' as EventType, { foo: 'bar' });
    const events: GameEvent[] = [mkEvent(EventType.GAME_START, {}), unknown];

    const tree = buildGameHistoryTree(events, players);
    // Unknown event should reach the inning items as an interstitial
    expect(tree.innings).toHaveLength(1);
    const top = tree.innings[0].top!;
    expect(top.items).toHaveLength(1);
    expect(top.items[0].type).toBe('interstitial');
    if (top.items[0].type !== 'interstitial') throw new Error('expected interstitial');
    expect(top.items[0].event.eventType).toBe('some_future_type');
    // Label should fall back to capitalized type name
    expect(top.items[0].label).toMatch(/Some Future Type/i);
  });

  it('renders PITCH_REVERTED and EVENT_VOIDED as interstitials when passed in un-filtered', () => {
    // Pins behavior for callers who forget applyPitchRevertedTyped — we
    // surface these correction events via the defensive default rather
    // than silently swallowing them, so the data-quality issue is visible.
    const events: GameEvent[] = [
      mkEvent(EventType.GAME_START, {}),
      mkEvent(EventType.PITCH_REVERTED, { revertToSequenceNumber: 5 }),
      mkEvent(EventType.EVENT_VOIDED, { voidedEventId: 'e1', voidedSequenceNumber: 4 }),
    ];
    const tree = buildGameHistoryTree(events, players);
    const top = tree.innings[0].top!;
    expect(top.items.length).toBe(2);
    expect(top.items.every((item) => item.type === 'interstitial')).toBe(true);
  });
});

describe('getEventCategory — coverage for newly classified events', () => {
  it('classifies DROPPED_THIRD_STRIKE as negative (default; thrown_out variant)', () => {
    // Category is based solely on event type (not payload); the
    // per-instance positive/negative distinction for D3K is handled
    // inside buildGameHistoryTree when it has payload access.
    expect(getEventCategory(EventType.DROPPED_THIRD_STRIKE)).toBe('negative');
  });

  it('classifies CATCHER_INTERFERENCE as positive (batter reaches)', () => {
    expect(getEventCategory(EventType.CATCHER_INTERFERENCE)).toBe('positive');
  });

  it('classifies BASERUNNER_ADVANCE as positive', () => {
    expect(getEventCategory(EventType.BASERUNNER_ADVANCE)).toBe('positive');
  });

  it('classifies RUNDOWN as info (outcome determines positivity per-instance)', () => {
    expect(getEventCategory(EventType.RUNDOWN)).toBe('info');
  });
});
