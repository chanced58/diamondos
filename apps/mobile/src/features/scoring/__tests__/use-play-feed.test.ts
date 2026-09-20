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

  it('keeps the pitches of a plate appearance visible after its terminal event is voided', () => {
    const ball = mkEvent(EventType.PITCH_THROWN, { batterId: 'alice', outcome: PitchOutcome.BALL });
    const inPlay = mkEvent(EventType.PITCH_THROWN, { batterId: 'alice', outcome: PitchOutcome.IN_PLAY });
    const hit = mkEvent(EventType.HIT, { batterId: 'alice', hitType: HitType.SINGLE });
    const voidPayload: EventVoidedPayload = { voidedEventId: hit.id, voidedSequenceNumber: hit.sequenceNumber };
    const events: GameEvent[] = [
      ball,
      inPlay,
      hit,
      mkEvent(EventType.EVENT_VOIDED, voidPayload as unknown as Record<string, unknown>),
    ];
    const { result } = renderHook(() => usePlayFeed(events, names));
    // Replay drops the hit, so Alice is still batting: her pitches stay listed
    // under the struck-through hit instead of disappearing with it.
    expect(result.current.map((r) => [r.eventId, r.isVoided])).toEqual([
      [hit.id, true],
      [inPlay.id, false],
      [ball.id, false],
    ]);
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

  it('keeps every PITCH_THROWN row visible while the plate appearance stays open, with no mid-PA drop', () => {
    // IMPORTANT 1: a second pitch landing in a still-open PA must not erase
    // the first pitch's row — only closing the PA with a terminal event
    // should replace the pitch rows with the play's own summary row.
    const strike = mkEvent(EventType.PITCH_THROWN, { batterId: 'alice', outcome: PitchOutcome.CALLED_STRIKE });
    const ball = mkEvent(EventType.PITCH_THROWN, { batterId: 'alice', outcome: PitchOutcome.BALL });
    const { result } = renderHook(() => usePlayFeed([strike, ball], names));
    expect(result.current).toHaveLength(2);
    expect(result.current.map((r) => r.description)).toEqual(['Ball', 'Called strike']);
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

  it('CRITICAL 1: reflects a voided linked runner-outcome in the parent row instead of showing stale text', () => {
    const hit = mkEvent(EventType.HIT, { batterId: 'alice', hitType: HitType.DOUBLE });
    const outcome = mkEvent(EventType.BASERUNNER_OUT, {
      runnerId: 'bob',
      fromBase: 1,
      relatedEventId: hit.id,
      reason: AdvanceReason.ON_PLAY,
    });
    const voidPayload: EventVoidedPayload = {
      voidedEventId: outcome.id,
      voidedSequenceNumber: outcome.sequenceNumber,
    };
    const events: GameEvent[] = [
      hit,
      outcome,
      mkEvent(EventType.EVENT_VOIDED, voidPayload as unknown as Record<string, unknown>),
    ];
    const { result } = renderHook(() => usePlayFeed(events, names));
    // The linked child never gets its own row (still folded into the
    // parent), but the parent's text must change to show the correction —
    // never the original, now-untrue, claim.
    expect(result.current).toHaveLength(1);
    expect(result.current[0]).toMatchObject({ eventId: hit.id, isVoided: false });
    expect(result.current[0].description).toBe("Alice — double (Bob's call reversed)");
    expect(result.current[0].description).not.toContain('thrown out advancing');
  });

  it('CRITICAL 2: renders an orphaned linked child as its own row when the parent formats to null', () => {
    // Mirrors handlePickoff's error-advance path: PICKOFF_ATTEMPT.outcome
    // is coerced to 'safe' (formats to null on its own), but the linked
    // BASERUNNER_ADVANCE it produces is a real defensive-error play.
    const pickoff = mkEvent(EventType.PICKOFF_ATTEMPT, {
      runnerId: 'bob',
      base: 1,
      outcome: 'safe',
    });
    const advance = mkEvent(EventType.BASERUNNER_ADVANCE, {
      runnerId: 'bob',
      fromBase: 1,
      toBase: 2,
      reason: AdvanceReason.ERROR,
      relatedEventId: pickoff.id,
    });
    const { result } = renderHook(() => usePlayFeed([pickoff, advance], names));
    // Must leave a trace: one standalone row for the otherwise-orphaned play.
    expect(result.current).toHaveLength(1);
    expect(result.current[0]).toMatchObject({ eventId: pickoff.id, isVoided: false });
    expect(result.current[0].description).toBe('Bob advanced to 2B');
  });

  it('drops events truncated by a PITCH_REVERTED, but leaves a collapsed trace row behind', () => {
    const ball = mkEvent(EventType.PITCH_THROWN, { batterId: 'alice', outcome: PitchOutcome.BALL });
    const strike = mkEvent(EventType.PITCH_THROWN, { batterId: 'alice', outcome: PitchOutcome.CALLED_STRIKE });
    const revert = mkEvent(EventType.PITCH_REVERTED, { revertToSequenceNumber: ball.sequenceNumber });
    const { result } = renderHook(() => usePlayFeed([ball, strike, revert], names));
    // The reverted-away strike never becomes a row, and the revert marker
    // itself isn't a play — but IMPORTANT 2 requires some visible trace
    // that a revert happened, rather than silent disappearance.
    expect(result.current).toHaveLength(2);
    expect(result.current[0]).toMatchObject({
      eventId: revert.id,
      isCorrectionMarker: true,
      isVoided: false,
    });
    expect(result.current[0].description).toMatch(/reverted/i);
    expect(result.current[1]).toMatchObject({ eventId: ball.id, description: 'Ball' });
  });

  it('does not leave a trace row for a PITCH_REVERTED that removed nothing', () => {
    const ball = mkEvent(EventType.PITCH_THROWN, { batterId: 'alice', outcome: PitchOutcome.BALL });
    const revert = mkEvent(EventType.PITCH_REVERTED, { revertToSequenceNumber: ball.sequenceNumber });
    const { result } = renderHook(() => usePlayFeed([ball, revert], names));
    expect(result.current).toHaveLength(1);
    expect(result.current[0]).toMatchObject({ eventId: ball.id, description: 'Ball' });
  });
});

describe('usePlayFeed linked advances on a hit', () => {

  it('should say a runner scored, not "held at home", when they advance home on a single', () => {
    const hit = mkEvent(EventType.HIT, { batterId: 'alice', hitType: HitType.SINGLE });
    const advance = mkEvent(EventType.BASERUNNER_ADVANCE, {
      runnerId: 'bob', fromBase: 2, toBase: 4, reason: AdvanceReason.ON_PLAY, relatedEventId: hit.id,
    });
    const { result } = renderHook(() => usePlayFeed([hit, advance], names));
    expect(result.current[0].description).toBe('Alice — single (Bob scored)');
  });

  it('should say a runner took a base beyond the standard advance', () => {
    const hit = mkEvent(EventType.HIT, { batterId: 'alice', hitType: HitType.SINGLE });
    const advance = mkEvent(EventType.BASERUNNER_ADVANCE, {
      runnerId: 'bob', fromBase: 1, toBase: 3, reason: AdvanceReason.ON_PLAY, relatedEventId: hit.id,
    });
    const { result } = renderHook(() => usePlayFeed([hit, advance], names));
    expect(result.current[0].description).toBe('Alice — single (Bob took 3B)');
  });

  it('should still say held for a runner stopped short of the standard advance', () => {
    const hit = mkEvent(EventType.HIT, { batterId: 'alice', hitType: HitType.DOUBLE });
    const advance = mkEvent(EventType.BASERUNNER_ADVANCE, {
      runnerId: 'bob', fromBase: 2, toBase: 3, reason: AdvanceReason.ON_PLAY, relatedEventId: hit.id,
    });
    const { result } = renderHook(() => usePlayFeed([hit, advance], names));
    expect(result.current[0].description).toBe('Alice — double (Bob held at 3B)');
  });
});
