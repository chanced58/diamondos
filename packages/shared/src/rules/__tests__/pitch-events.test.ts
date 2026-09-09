import { requiresPitchEvent, IN_PLAY_TERMINAL_EVENTS } from '../pitch-events';
import { EventType } from '../../types/game-event';

describe('requiresPitchEvent', () => {
  it.each([
    EventType.HIT,
    EventType.OUT,
    EventType.SACRIFICE_FLY,
    EventType.SACRIFICE_BUNT,
    EventType.FIELD_ERROR,
    EventType.CATCHER_INTERFERENCE,
    EventType.DOUBLE_PLAY,
    EventType.TRIPLE_PLAY,
  ])('requires a pitch for %s', (t) => {
    expect(requiresPitchEvent(t)).toBe(true);
  });

  it.each([
    EventType.WALK,
    EventType.STRIKEOUT,
    EventType.DROPPED_THIRD_STRIKE,
    EventType.HIT_BY_PITCH,
    EventType.STOLEN_BASE,
    EventType.CAUGHT_STEALING,
    EventType.BALK,
    EventType.PITCH_THROWN,
    EventType.SUBSTITUTION,
    EventType.INNING_CHANGE,
  ])('does not require a pitch for %s', (t) => {
    expect(requiresPitchEvent(t)).toBe(false);
  });

  it('lists exactly the eight in-play terminals', () => {
    expect([...IN_PLAY_TERMINAL_EVENTS].sort()).toEqual(
      [
        EventType.CATCHER_INTERFERENCE,
        EventType.DOUBLE_PLAY,
        EventType.FIELD_ERROR,
        EventType.HIT,
        EventType.OUT,
        EventType.SACRIFICE_BUNT,
        EventType.SACRIFICE_FLY,
        EventType.TRIPLE_PLAY,
      ].sort(),
    );
  });
});
