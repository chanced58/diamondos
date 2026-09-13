import { formatEventDescription } from '../format-event';
import { EventType, HitType, PitchOutcome } from '../../types/game-event';

const names: Record<string, string> = { alice: 'Alice', bob: 'Bob' };
const resolve = (id: string | null | undefined) => (id && names[id]) || '—';

describe('formatEventDescription', () => {
  it('describes a HIT with the batter name and hit type', () => {
    expect(
      formatEventDescription({ eventType: EventType.HIT, payload: { batterId: 'alice', hitType: HitType.DOUBLE } }, resolve),
    ).toBe('Alice — double');
  });

  it('falls back to a capitalized label when the batter cannot be resolved', () => {
    expect(
      formatEventDescription({ eventType: EventType.HIT, payload: { hitType: HitType.SINGLE } }, resolve),
    ).toBe('Single');
  });

  it('describes pitch outcomes without a player name', () => {
    expect(
      formatEventDescription({ eventType: EventType.PITCH_THROWN, payload: { outcome: PitchOutcome.CALLED_STRIKE } }, resolve),
    ).toBe('Called strike');
    expect(
      formatEventDescription({ eventType: EventType.PITCH_THROWN, payload: { outcome: PitchOutcome.BALL } }, resolve),
    ).toBe('Ball');
  });

  it('describes a linked baserunner out', () => {
    expect(
      formatEventDescription(
        { eventType: EventType.BASERUNNER_OUT, payload: { runnerId: 'bob' } },
        resolve,
      ),
    ).toBe('Bob out on the basepaths');
  });

  it('returns null for correction marker events', () => {
    expect(
      formatEventDescription({ eventType: EventType.PITCH_REVERTED, payload: { revertToSequenceNumber: 3 } }, resolve),
    ).toBeNull();
    expect(
      formatEventDescription({ eventType: EventType.EVENT_VOIDED, payload: { voidedEventId: 'e1' } }, resolve),
    ).toBeNull();
  });

  it('returns null for a safe pickoff attempt (not eventful)', () => {
    expect(
      formatEventDescription(
        { eventType: EventType.PICKOFF_ATTEMPT, payload: { runnerId: 'bob', outcome: 'safe', base: 1 } },
        resolve,
      ),
    ).toBeNull();
  });

  it('describes a picked-off runner', () => {
    expect(
      formatEventDescription(
        { eventType: EventType.PICKOFF_ATTEMPT, payload: { runnerId: 'bob', outcome: 'out', base: 1 } },
        resolve,
      ),
    ).toBe('Bob picked off');
  });

  it('describes fixed-text event types with no player involved', () => {
    expect(formatEventDescription({ eventType: EventType.GAME_START, payload: {} }, resolve)).toBe('Play ball!');
    expect(formatEventDescription({ eventType: EventType.GAME_END, payload: {} }, resolve)).toBe('Final');
    expect(formatEventDescription({ eventType: EventType.SACRIFICE_FLY, payload: {} }, resolve)).toBe('Sacrifice fly');
  });
});
