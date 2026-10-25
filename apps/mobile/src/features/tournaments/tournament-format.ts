import { formatInTimeZone } from '@baseball/shared';
import { localDateFromParts } from '../forms/date-parts';

/** A calendar day as "Oct 30, 2026" (no zone: a tournament's days are its own). */
function dayLabel(isoDate: string, withYear: boolean): string {
  return localDateFromParts(isoDate, '12:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(withYear ? { year: 'numeric' } : {}),
  });
}

/** "Oct 30 – Nov 1, 2026", "Oct 30, 2026" for one day, or both years when they differ. */
export function tournamentDates(startDate: string, endDate: string): string {
  if (startDate === endDate) return dayLabel(startDate, true);
  const sameYear = startDate.slice(0, 4) === endDate.slice(0, 4);
  return `${dayLabel(startDate, !sameYear)} – ${dayLabel(endDate, true)}`;
}

/** "Scheduled", "In progress"… from a status value. */
export function statusLabel(status: string): string {
  const words = status.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** A tournament game's start in its own zone, e.g. "Oct 30, 4:00 PM". */
export function gameWhen(scheduledAt: string, timeZone: string | null): string {
  return formatInTimeZone(scheduledAt, timeZone, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** The stats caption under Player stats, as on the web page. */
export function statsCaption(scoredGameCount: number): string {
  if (scoredGameCount === 0) return 'Stats appear here once a tournament game is scored.';
  return `From ${scoredGameCount} scored ${scoredGameCount === 1 ? 'game' : 'games'}. Tournament stats are kept separate from the regular season.`;
}
