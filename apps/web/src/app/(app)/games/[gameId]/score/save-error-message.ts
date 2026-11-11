import { isEventClockAheadRejection } from '@baseball/shared';

/**
 * What the scorer is told when an event did not save. The server refuses an
 * event stamped more than a day ahead of its clock, and the web stamps events
 * with the computer's clock, so retrying cannot help until that is fixed.
 */
export function eventSaveErrorMessage(error: unknown): string {
  if (isEventClockAheadRejection(error)) {
    return "Not saved: this computer's date and time are more than a day ahead. Fix the clock, then try again.";
  }
  return 'Failed to save last action. Please try again.';
}
