import { renderHook } from '@testing-library/react-native';
import { usePlayFeed } from '../use-play-feed';
import {
  EventType,
  PitchOutcome,
  HitType,
  AdvanceReason,
  type GameEvent,
  type EventVoidedPayload,
} from '@baseball/shared';

let seq = 0;
const resetSeq = () => { seq = 0; };

const mkEvent = (
  eventType: EventType,
  payload: Record<string, unknown>,
  overrides: Partial<GameEvent> = {},
): GameEvent => ({
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
  ...overrides,
});

const names: Record<string, string> = { alice: 'Alice', bob: 'Bob' };

describe('usePlayFeed', () => {
  beforeEach(resetSeq);

  it('yields one row with a human description for a HIT event', () => {
    const events: GameEvent[] = [
      mkEvent(EventType.HIT, { batterId: 'alice', hitType: HitType.DOUBLE }),
    ];
    const { result } = renderHook(() => usePlayFeed(events, names));
    expect(result.current).toHaveLength(1);
    expect(result.current[0]).toMatchObject({
      eventId: 'evt-0',
      description: 'Alice — double',
      isVoided: false,
    });
  });

  it('marks the EVENT_VOIDED target as voided rather than removing it', () => {
    const hit = mkEvent(EventType.HIT, { batterId: 'alice', hitType: HitType.SINGLE });
    const voidPayload: EventVoidedPayload = {
      voidedEventId: hit.id,
      voidedSequenceNumber: hit.sequenceNumber,
    };
    const events: GameEvent[] = [
      hit,
      mkEvent(EventType.EVENT_VOIDED, voidPayload as unknown as Record<string, unknown>),
    ];
    const { result } = renderHook(() => usePlayFeed(events, names));
    // The correction marker itself never becomes a row — only its target does,
    // struck through rather than erased.
    expect(result.current).toHaveLength(1);
    expect(result.current[0]).toMatchObject({ eventId: hit.id, isVoided: true });
  });

  it('returns rows newest-first', () => {
    const events: GameEvent[] = [
      mkEvent(EventType.HIT, { batterId: 'alice', hitType: HitType.SINGLE }),
      mkEvent(EventType.STRIKEOUT, { batterId: 'bob' }),
    ];
    const { result } = renderHook(() => usePlayFeed(events, names));
    expect(result.current.map((r) => r.eventId)).toEqual(['evt-1', 'evt-0']);
  });

  it('skips PITCH_THROWN rows once the plate appearance has another event', () => {
    const events: GameEvent[] = [
      mkEvent(EventType.PITCH_THROWN, { batterId: 'alice', outcome: PitchOutcome.BALL }),
      mkEvent(EventType.PITCH_THROWN, { batterId: 'alice', outcome: PitchOutcome.IN_PLAY }),
      mkEvent(EventType.HIT, { batterId: 'alice', hitType: HitType.SINGLE }),
    ];
    const { result } = renderHook(() => usePlayFeed(events, names));
    expect(result.current).toHaveLength(1);
    expect(result.current[0].description).toBe('Alice — single');
  });

  it('keeps a PITCH_THROWN row when it is the only event in its still-open plate appearance', () => {
    const events: GameEvent[] = [
      mkEvent(EventType.HIT, { batterId: 'bob', hitType: HitType.SINGLE }),
      mkEvent(EventType.PITCH_THROWN, { batterId: 'alice', outcome: PitchOutcome.BALL }),
    ];
    const { result } = renderHook(() => usePlayFeed(events, names));
    expect(result.current[0]).toMatchObject({ description: 'Ball', isVoided: false });
    expect(result.current[1].description).toBe('Bob — single');
  });

  it('collapses a linked runner-outcome event into a parenthetical on its parent play', () => {
    const hit = mkEvent(EventType.HIT, { batterId: 'alice', hitType: HitType.DOUBLE });
    const outcome = mkEvent(EventType.BASERUNNER_OUT, {
      runnerId: 'bob',
      fromBase: 1,
      relatedEventId: hit.id,
      reason: AdvanceReason.VOLUNTARY,
    });
    const { result } = renderHook(() => usePlayFeed([hit, outcome], names));
    expect(result.current).toHaveLength(1);
    expect(result.current[0].description).toBe('Alice — double (Bob thrown out advancing)');
  });

  it('drops events truncated by a PITCH_REVERTED rather than showing them', () => {
    const ball = mkEvent(EventType.PITCH_THROWN, { batterId: 'alice', outcome: PitchOutcome.BALL });
    const strike = mkEvent(EventType.PITCH_THROWN, { batterId: 'alice', outcome: PitchOutcome.CALLED_STRIKE });
    const revert = mkEvent(EventType.PITCH_REVERTED, { revertToSequenceNumber: ball.sequenceNumber });
    const { result } = renderHook(() => usePlayFeed([ball, strike, revert], names));
    // Only the ball survives the revert; the reverted-away strike and the
    // revert marker itself never become rows.
    expect(result.current).toHaveLength(1);
    expect(result.current[0]).toMatchObject({ eventId: ball.id, description: 'Ball' });
  });
});
