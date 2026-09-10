import { voidEvent } from '../void-event';
import {
  EventType,
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

describe('voidEvent', () => {
  beforeEach(resetSeq);

  it('appends a single EVENT_VOIDED targeting a plain play with no linked children', async () => {
    const strikeout = mkEvent(EventType.STRIKEOUT, { batterId: 'bob' });
    const events: GameEvent[] = [strikeout];
    const recordVoid = jest.fn().mockResolvedValue('void-1');

    await voidEvent(strikeout.id, events, { recordVoid });

    expect(recordVoid).toHaveBeenCalledTimes(1);
    expect(recordVoid).toHaveBeenCalledWith({
      voidedEventId: strikeout.id,
      voidedSequenceNumber: strikeout.sequenceNumber,
    });
  });

  it('voiding a parent HIT also emits EVENT_VOIDED for its linked BASERUNNER_OUT', async () => {
    const hit = mkEvent(EventType.HIT, { batterId: 'alice', hitType: HitType.DOUBLE });
    const runnerOut = mkEvent(EventType.BASERUNNER_OUT, {
      runnerId: 'carol',
      fromBase: 1,
      toBase: 3,
      relatedEventId: hit.id,
    });
    const events: GameEvent[] = [hit, runnerOut];
    const recordVoid = jest.fn().mockResolvedValue('void-1');

    await voidEvent(hit.id, events, { recordVoid });

    // Child voided before parent, cascade-style, matching handleUndo's
    // original ordering.
    expect(recordVoid).toHaveBeenCalledTimes(2);
    expect(recordVoid).toHaveBeenNthCalledWith(1, {
      voidedEventId: runnerOut.id,
      voidedSequenceNumber: runnerOut.sequenceNumber,
    });
    expect(recordVoid).toHaveBeenNthCalledWith(2, {
      voidedEventId: hit.id,
      voidedSequenceNumber: hit.sequenceNumber,
    });
  });

  it('voiding a parent play also cascades a linked BASERUNNER_ADVANCE', async () => {
    const hit = mkEvent(EventType.HIT, { batterId: 'alice', hitType: HitType.DOUBLE });
    const advance = mkEvent(EventType.BASERUNNER_ADVANCE, {
      runnerId: 'carol',
      fromBase: 1,
      toBase: 3,
      reason: AdvanceReason.ON_PLAY,
      relatedEventId: hit.id,
    });
    const events: GameEvent[] = [hit, advance];
    const recordVoid = jest.fn().mockResolvedValue('void-1');

    await voidEvent(hit.id, events, { recordVoid });

    expect(recordVoid).toHaveBeenCalledTimes(2);
    expect(recordVoid).toHaveBeenNthCalledWith(1, {
      voidedEventId: advance.id,
      voidedSequenceNumber: advance.sequenceNumber,
    });
    expect(recordVoid).toHaveBeenNthCalledWith(2, {
      voidedEventId: hit.id,
      voidedSequenceNumber: hit.sequenceNumber,
    });
  });

  it('voiding an already-voided event is a no-op', async () => {
    const hit = mkEvent(EventType.HIT, { batterId: 'alice', hitType: HitType.SINGLE });
    const priorVoid: EventVoidedPayload = {
      voidedEventId: hit.id,
      voidedSequenceNumber: hit.sequenceNumber,
    };
    const events: GameEvent[] = [
      hit,
      mkEvent(EventType.EVENT_VOIDED, priorVoid as unknown as Record<string, unknown>),
    ];
    const recordVoid = jest.fn().mockResolvedValue('void-2');

    await voidEvent(hit.id, events, { recordVoid });

    expect(recordVoid).not.toHaveBeenCalled();
  });

  it('skips a linked child that was already voided independently, but still voids the parent', async () => {
    const hit = mkEvent(EventType.HIT, { batterId: 'alice', hitType: HitType.DOUBLE });
    const runnerOut = mkEvent(EventType.BASERUNNER_OUT, {
      runnerId: 'carol',
      fromBase: 1,
      toBase: 3,
      relatedEventId: hit.id,
    });
    const priorChildVoid: EventVoidedPayload = {
      voidedEventId: runnerOut.id,
      voidedSequenceNumber: runnerOut.sequenceNumber,
    };
    const events: GameEvent[] = [
      hit,
      runnerOut,
      mkEvent(EventType.EVENT_VOIDED, priorChildVoid as unknown as Record<string, unknown>),
    ];
    const recordVoid = jest.fn().mockResolvedValue('void-3');

    await voidEvent(hit.id, events, { recordVoid });

    expect(recordVoid).toHaveBeenCalledTimes(1);
    expect(recordVoid).toHaveBeenCalledWith({
      voidedEventId: hit.id,
      voidedSequenceNumber: hit.sequenceNumber,
    });
  });

  it('is a no-op when the target event does not exist in the given stream', async () => {
    const events: GameEvent[] = [mkEvent(EventType.STRIKEOUT, { batterId: 'bob' })];
    const recordVoid = jest.fn().mockResolvedValue('void-4');

    await voidEvent('does-not-exist', events, { recordVoid });

    expect(recordVoid).not.toHaveBeenCalled();
  });

  it('refuses to void a correction event itself (EVENT_VOIDED / PITCH_REVERTED)', async () => {
    const hit = mkEvent(EventType.HIT, { batterId: 'alice', hitType: HitType.SINGLE });
    const priorVoid: EventVoidedPayload = {
      voidedEventId: hit.id,
      voidedSequenceNumber: hit.sequenceNumber,
    };
    const voidEvt = mkEvent(EventType.EVENT_VOIDED, priorVoid as unknown as Record<string, unknown>);
    const revertEvt = mkEvent(EventType.PITCH_REVERTED, { revertToSequenceNumber: 0 });
    const events: GameEvent[] = [hit, voidEvt, revertEvt];
    const recordVoid = jest.fn().mockResolvedValue('void-5');

    await voidEvent(voidEvt.id, events, { recordVoid });
    await voidEvent(revertEvt.id, events, { recordVoid });

    expect(recordVoid).not.toHaveBeenCalled();
  });

  it('voids a play found far back in a long event stream, not just the tail', async () => {
    const oldPlay = mkEvent(EventType.STRIKEOUT, { batterId: 'bob' }, { inning: 1 });
    const filler: GameEvent[] = [];
    for (let i = 0; i < 80; i++) {
      filler.push(mkEvent(EventType.PITCH_THROWN, { batterId: 'alice' }, { inning: 3 }));
    }
    const events: GameEvent[] = [oldPlay, ...filler];
    const recordVoid = jest.fn().mockResolvedValue('void-6');

    await voidEvent(oldPlay.id, events, { recordVoid });

    expect(recordVoid).toHaveBeenCalledTimes(1);
    expect(recordVoid).toHaveBeenCalledWith({
      voidedEventId: oldPlay.id,
      voidedSequenceNumber: oldPlay.sequenceNumber,
    });
  });
});
