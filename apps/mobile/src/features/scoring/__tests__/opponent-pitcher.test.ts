import { EventType, type GameEvent } from '@baseball/shared';
import { currentOpponentPitcherId } from '../opponent-pitcher';

const slots = [
  { opponentPlayerRemoteId: 'opp-1', startingPosition: 'catcher' },
  { opponentPlayerRemoteId: 'opp-p', startingPosition: 'pitcher' },
];

function change(sequenceNumber: number, payload: Record<string, unknown>): GameEvent {
  return {
    id: `e${sequenceNumber}`,
    gameId: 'g1',
    sequenceNumber,
    eventType: EventType.PITCHING_CHANGE,
    inning: 3,
    isTopOfInning: true,
    payload,
    occurredAt: '2026-01-01T12:00:00.000Z',
    createdBy: 'u1',
    deviceId: 'd1',
  } as GameEvent;
}

describe('currentOpponentPitcherId', () => {
  it('should use the opponent lineup\'s pitcher', () => {
    expect(currentOpponentPitcherId(slots, [])).toBe('opp-p');
  });

  it('should accept the P abbreviation the web lineup writes', () => {
    expect(
      currentOpponentPitcherId([{ opponentPlayerRemoteId: 'opp-9', startingPosition: 'P' }], []),
    ).toBe('opp-9');
  });

  it('should be null when no slot is the pitcher and no change was recorded', () => {
    expect(currentOpponentPitcherId([slots[0]], [])).toBeNull();
  });

  it('should switch after an opponent pitching change', () => {
    const events = [change(5, { newPitcherId: 'opp-relief', isOpponentChange: true })];
    expect(currentOpponentPitcherId(slots, events)).toBe('opp-relief');
  });

  it('should take the latest of several opponent changes regardless of array order', () => {
    const events = [
      change(9, { newPitcherId: 'opp-third', isOpponentChange: true }),
      change(5, { newPitcherId: 'opp-relief', isOpponentChange: true }),
    ];
    expect(currentOpponentPitcherId(slots, events)).toBe('opp-third');
  });

  it('should ignore our own pitching changes', () => {
    const events = [change(5, { newPitcherId: 'ours', isOpponentChange: false }), change(6, { newPitcherId: 'ours-2' })];
    expect(currentOpponentPitcherId(slots, events)).toBe('opp-p');
  });

  it('should name the pitcher from a change when the lineup has none', () => {
    const events = [change(5, { newPitcherId: 'opp-relief', isOpponentChange: true })];
    expect(currentOpponentPitcherId([slots[0]], events)).toBe('opp-relief');
  });
});
