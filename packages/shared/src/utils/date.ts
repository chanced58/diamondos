/**
 * Date/time helpers. Scheduled times are stored as absolute instants
 * (timestamptz) alongside the IANA zone they were entered in (e.g. a game's
 * `time_zone`). Pass that zone to the formatters so every surface — a server
 * render running in UTC, a parent's phone in another state — shows the same
 * game-local wall-clock time. Omitting it keeps the host's local zone.
 */

/** True when `tz` is an IANA zone name the runtime's Intl data recognises. */
export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || tz === '') return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function zoneOption(timeZone: string | null | undefined): { timeZone?: string } {
  return isValidTimeZone(timeZone) ? { timeZone } : {};
}

/** Returns a human-readable date string like "Feb 20, 2026" */
export function formatDate(date: Date | string, timeZone?: string | null): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', ...zoneOption(timeZone) });
}

/** Returns a human-readable time string like "7:00 PM" */
export function formatTime(date: Date | string, timeZone?: string | null): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', ...zoneOption(timeZone) });
}

/**
 * `toLocaleString` in `timeZone` (host zone when missing or invalid), for the
 * custom layouts the fixed formatters above don't cover.
 */
export function formatInTimeZone(
  date: Date | string,
  timeZone: string | null | undefined,
  options: Intl.DateTimeFormatOptions,
): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString('en-US', { ...options, ...zoneOption(timeZone) });
}

type WallClock = { year: number; month: number; day: number; hour: number; minute: number };

function wallClockIn(utcMs: number, timeZone: string): WallClock {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(new Date(utcMs));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour') % 24, minute: get('minute') };
}

/** Offset of `timeZone` from UTC at the instant `utcMs`, in ms (e.g. -7h for Phoenix). */
function zoneOffsetMs(utcMs: number, timeZone: string): number {
  const w = wallClockIn(utcMs, timeZone);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute);
  return asUtc - Math.floor(utcMs / 60_000) * 60_000;
}

/**
 * Converts a wall-clock date + time typed in `timeZone` to a UTC ISO string,
 * using the offset in effect on that date (so a March game entered in
 * October still lands on the right side of DST). A time that falls in a
 * spring-forward gap is moved forward by the gap.
 *
 * @param date - "YYYY-MM-DD"
 * @param time - "HH:MM" (24-hour)
 * @param timeZone - IANA zone, e.g. "America/Boise"
 */
export function zonedDateTimeToUtc(date: string, time: string, timeZone: string): string {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const tm = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(time);
  if (!dm || !tm) throw new Error(`Invalid date/time: ${date} ${time}`);
  if (!isValidTimeZone(timeZone)) throw new Error(`Unknown time zone: ${timeZone}`);

  const wallAsUtc = Date.UTC(Number(dm[1]), Number(dm[2]) - 1, Number(dm[3]), Number(tm[1]), Number(tm[2]));
  // Near a DST change the offset at wallAsUtc can differ from the offset at
  // the real instant, so try both offsets and keep the one that reproduces
  // the typed wall clock. In a spring-forward gap neither does; the later
  // candidate is the one pushed forward past the gap.
  const firstGuess = wallAsUtc - zoneOffsetMs(wallAsUtc, timeZone);
  const secondGuess = wallAsUtc - zoneOffsetMs(firstGuess, timeZone);
  const reproduces = (ms: number) => {
    const w = wallClockIn(ms, timeZone);
    return Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute) === wallAsUtc;
  };
  const instant = reproduces(firstGuess)
    ? firstGuess
    : reproduces(secondGuess)
      ? secondGuess
      : Math.max(firstGuess, secondGuess);
  return new Date(instant).toISOString();
}

/**
 * Splits an instant into the "YYYY-MM-DD" / "HH:MM" wall-clock values an
 * `<input type="date">` / `<input type="time">` pair expects, in `timeZone`
 * (host zone when omitted or invalid).
 */
export function utcToZonedDateTime(
  instant: Date | string,
  timeZone?: string | null,
): { date: string; time: string } {
  const ms = (typeof instant === 'string' ? new Date(instant) : instant).getTime();
  const tz = isValidTimeZone(timeZone) ? timeZone : Intl.DateTimeFormat().resolvedOptions().timeZone;
  const w = wallClockIn(ms, tz);
  const pad = (n: number) => String(n).padStart(2, '0');
  return { date: `${w.year}-${pad(w.month)}-${pad(w.day)}`, time: `${pad(w.hour)}:${pad(w.minute)}` };
}
