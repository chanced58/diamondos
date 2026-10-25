import { utcToZonedDateTime, zonedDateTimeToUtc } from '@baseball/shared';

/**
 * Default the practice to 3 PM two days before the next game, or tomorrow at
 * 3 PM if that is already past — 3 PM in the game's time zone, since this runs
 * on a UTC server (see GameTimeZone in CLAUDE.md). The form lets the coach
 * change it.
 */
export function computeDefaultScheduledAt(gameIso: string, now: Date, timeZone: string | null): string {
  const zone = timeZone ?? 'UTC';
  const threePmDaysAfter = (instant: Date, days: number) => {
    const [year, month, day] = utcToZonedDateTime(instant, zone).date.split('-').map(Number);
    const shifted = new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
    return zonedDateTimeToUtc(shifted, '15:00', zone);
  };
  const target = threePmDaysAfter(new Date(gameIso), -2);
  return Date.parse(target) < now.getTime() ? threePmDaysAfter(now, 1) : target;
}
