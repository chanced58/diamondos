import { EventType, PitchOutcome } from '../types/game-event';

/**
 * Returns the terminal event that must follow a pitch outcome.
 *
 * Some pitch outcomes are only observations. A hit-by-pitch must be followed
 * by an explicit terminal event so replay can award first base and close the
 * plate appearance.
 */
export function terminalEventForPitchOutcome(
  outcome: PitchOutcome,
): EventType | null {
  if (outcome === PitchOutcome.HIT_BY_PITCH) {
    return EventType.HIT_BY_PITCH;
  }

  return null;
}
