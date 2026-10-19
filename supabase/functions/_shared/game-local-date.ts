/**
 * The calendar day ("YYYY-MM-DD") a game is played on, in the game's own zone.
 *
 * `scheduled_at.split('T')[0]` gives the UTC day, which is the next day for
 * any evening game west of Greenwich — wrong for pitch-count rest windows.
 * Falls back to UTC when the zone is missing or unknown.
 */
export function gameLocalDate(scheduledAt: string, timeZone: string | null | undefined): string {
  const instant = new Date(scheduledAt);
  try {
    if (timeZone) {
      // en-CA formats dates as YYYY-MM-DD.
      return new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(instant);
    }
  } catch {
    // Unknown zone: fall through to UTC.
  }
  return instant.toISOString().slice(0, 10);
}
