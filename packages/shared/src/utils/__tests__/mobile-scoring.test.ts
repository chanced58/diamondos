import { EventType, PitchOutcome } from '../../types/game-event';
import { terminalEventForPitchOutcome } from '../mobile-scoring';

describe('terminalEventForPitchOutcome', () => {
  it('requires a hit-by-pitch terminal event after an HBP pitch', () => {
    expect(terminalEventForPitchOutcome(PitchOutcome.HIT_BY_PITCH)).toBe(
      EventType.HIT_BY_PITCH,
    );
  });

  it('does not create a terminal event for non-terminal pitch outcomes', () => {
    expect(terminalEventForPitchOutcome(PitchOutcome.BALL)).toBeNull();
    expect(terminalEventForPitchOutcome(PitchOutcome.IN_PLAY)).toBeNull();
  });
});
