/**
 * The server refuses a game_events row whose `occurred_at` is more than this
 * far ahead of its own clock (trigger `game_events_occurred_at_sanity`,
 * migration 20260420000001). Kept in step with the trigger's interval.
 */
export const MAX_EVENT_CLOCK_AHEAD_MS = 24 * 60 * 60 * 1000;

/** The HINT the trigger raises with, so clients can tell this refusal apart. */
export const EVENT_CLOCK_AHEAD_HINT = 'device_clock_ahead';

interface DatabaseErrorLike {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
}

/**
 * Is this error the server refusing an event stamped too far in the future,
 * i.e. the recording device's clock is ahead? Such an event is not bad data:
 * it is accepted as soon as real time comes within a day of its timestamp, so
 * callers keep it and try again rather than drop it.
 */
export function isEventClockAheadRejection(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const { code, hint, message } = error as DatabaseErrorLike;
  if (code !== 'P0001') return false;
  if (hint === EVENT_CLOCK_AHEAD_HINT) return true;
  return typeof message === 'string' && message.startsWith('game_events.occurred_at (');
}

/**
 * The server's clock (epoch ms) at the moment it refused the event, which the
 * trigger puts in DETAIL. Null when the error carries none (or is not this
 * refusal), so callers fall back to finding the refused events one by one.
 */
export function serverNowFromClockRejection(error: unknown): number | null {
  if (!isEventClockAheadRejection(error)) return null;
  const details = (error as DatabaseErrorLike).details;
  if (typeof details !== 'string' || !/^\d+$/.test(details.trim())) return null;
  const serverNowMs = Number(details.trim());
  return Number.isSafeInteger(serverNowMs) ? serverNowMs : null;
}
