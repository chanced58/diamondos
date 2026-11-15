import { errorMessageOf, sanitizeErrorDetails } from '@baseball/shared';

/**
 * Sends one client-side error to the error log. Fire-and-forget: it never
 * throws and never rejects, since it runs while the app is already failing.
 */
export function reportClientError(
  area: string,
  error: unknown,
  details?: Record<string, unknown>,
): void {
  try {
    const entry = {
      area,
      message: errorMessageOf(error) || '[no message]',
      details: sanitizeErrorDetails(details),
      occurredAt: new Date().toISOString(),
    };
    void fetch('/api/client-errors', {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entries: [entry] }),
    }).catch(() => undefined);
  } catch {
    // Reporting must never make a failing page worse.
  }
}
