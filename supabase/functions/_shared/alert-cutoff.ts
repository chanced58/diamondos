/**
 * Pitch-count alerts are for the game in front of the coach. An event older
 * than this (an offline phone syncing hours later, a replayed webhook) still
 * updates the pitch count but sends no push.
 */
export const ALERT_MAX_EVENT_AGE_MS = 6 * 3600 * 1000;

/** False when `occurredAt` is unparseable or older than the cutoff. */
export function shouldSendPitchAlert(occurredAt: string, nowMs: number): boolean {
  const occurredMs = Date.parse(occurredAt);
  if (Number.isNaN(occurredMs)) return false;
  return nowMs - occurredMs <= ALERT_MAX_EVENT_AGE_MS;
}
