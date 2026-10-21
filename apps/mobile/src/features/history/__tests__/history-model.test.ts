import { EventType, PitchOutcome, type GameEvent, type GameHistoryResponse } from '@baseball/shared';
import {
  correctionKind,
  historyTree,
  isCorrectable,
  pitchReplacement,
  resultReplacement,
  scoreReplacement,
} from '../history-model';

const event = (eventType: string, payload: Record<string, unknown> = {}, sequenceNumber = 5): GameEvent =>
  ({
    id: `e${sequenceNumber}`,
    gameId: 'g1',
    sequenceNumber,
    eventType: eventType as EventType,
    inning: 2,
    isTopOfInning: true,
    payload,
    occurredAt: '2026-10-20T23:00:00Z',
    createdBy: 'u',
    deviceId: 'd',
  }) as GameEvent;

describe('correctionKind', () => {
  it('should route each event to the correction the phone offers', () => {
    expect(correctionKind(event(EventType.PITCH_THROWN))).toBe('pitch');
    expect(correctionKind(event(EventType.HIT))).toBe('result');
    expect(correctionKind(event(EventType.STRIKEOUT))).toBe('result');
    expect(correctionKind(event(EventType.SCORE))).toBe('score');
    expect(correctionKind(event(EventType.STOLEN_BASE))).toBe('delete');
    expect(correctionKind(event(EventType.SUBSTITUTION))).toBe('delete');
  });

  it('should never offer to correct the game start or end', () => {
    expect(isCorrectable(event(EventType.GAME_START))).toBe(false);
    expect(isCorrectable(event(EventType.GAME_END))).toBe(false);
    expect(isCorrectable(event(EventType.WALK))).toBe(true);
  });
});

describe('replacements', () => {
  const ours = { batterId: 'b1', opponentPitcherId: 'op1', sprayX: 0.4, fieldingSequence: [6, 3] };

  it("should keep the batter and pitcher, on their sides, and drop the old play's details", () => {
    expect(resultReplacement(event(EventType.OUT, ours), 'double')).toEqual({
      eventType: EventType.HIT,
      payload: { batterId: 'b1', opponentPitcherId: 'op1', hitType: 'double' },
    });
  });

  it('should write outs with their type and trajectory', () => {
    expect(resultReplacement(event(EventType.HIT, ours), 'flyout').payload).toEqual({
      batterId: 'b1', opponentPitcherId: 'op1', outType: 'flyout', trajectory: 'fly_ball',
    });
    expect(resultReplacement(event(EventType.HIT, ours), 'popout').payload).toEqual({
      batterId: 'b1', opponentPitcherId: 'op1', outType: 'popout',
    });
  });

  it('should charge an error to the chosen fielder', () => {
    expect(resultReplacement(event(EventType.OUT, ours), 'error', 6)).toEqual({
      eventType: EventType.FIELD_ERROR,
      payload: { batterId: 'b1', opponentPitcherId: 'op1', errorBy: 6 },
    });
  });

  it('should replace a pitch outcome', () => {
    expect(pitchReplacement(event(EventType.PITCH_THROWN, { batterId: 'b1', pitcherId: 'p1', outcome: 'ball' }), PitchOutcome.FOUL)).toEqual({
      eventType: EventType.PITCH_THROWN,
      payload: { batterId: 'b1', pitcherId: 'p1', outcome: 'foul' },
    });
  });

  it("should change only a run's RBIs, not where the original sat in the log", () => {
    const run = event(EventType.SCORE, { scoringPlayerId: 'r1', rbis: 1, relatedEventId: 'e3', insertAfterSequence: 4 });
    expect(scoreReplacement(run, 0)).toEqual({
      eventType: EventType.SCORE,
      payload: { scoringPlayerId: 'r1', rbis: 0, relatedEventId: 'e3' },
    });
  });
});

describe('historyTree', () => {
  it('should drop voided events before building the tree', () => {
    const history = {
      events: [
        event(EventType.GAME_START, {}, 1),
        event(EventType.PITCH_THROWN, { batterId: 'b1', pitcherId: 'p1', outcome: 'ball' }, 2),
        event(EventType.WALK, { batterId: 'b1', pitcherId: 'p1' }, 3),
        event(EventType.EVENT_VOIDED, { voidedEventId: 'e3', voidedSequenceNumber: 3 }, 4),
      ],
      playerNames: { b1: 'Ada Abbott', p1: 'Ty Cobb' },
    } as unknown as GameHistoryResponse;

    const tree = historyTree(history);
    const atBat = tree.innings[0]?.top?.items[0];
    expect(atBat).toMatchObject({ type: 'at-bat', batterName: 'Ada Abbott', result: null });
  });
});
