/**
 * Month-view calendar math on calendar dates ("YYYY-MM-DD" keys), not
 * instants. Everything runs on UTC dates so the device's zone and DST can
 * never shift a day; callers turn an event's instant into its local day key
 * with `utcToZonedDateTime(instant, zone).date` first.
 */

export interface CalendarMonth {
  year: number;
  /** 1–12. */
  month: number;
}

export interface MonthGridCell {
  dateKey: string;
  day: number;
  /** False for the leading/trailing days borrowed from the adjacent months. */
  inMonth: boolean;
}

const pad = (n: number) => String(n).padStart(2, '0');

function keyOfUtcDate(date: Date): string {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** The month a "YYYY-MM-DD" key falls in. */
export function monthOfDateKey(dateKey: string): CalendarMonth {
  const [year, month] = dateKey.split('-').map(Number);
  return { year, month };
}

export function shiftMonth({ year, month }: CalendarMonth, delta: number): CalendarMonth {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12 + 12) % 12 + 1 };
}

/** First and last day keys of a month, for range queries. */
export function monthDateRange({ year, month }: CalendarMonth): { first: string; last: string } {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { first: `${year}-${pad(month)}-01`, last: `${year}-${pad(month)}-${pad(lastDay)}` };
}

/**
 * The month as full weeks (rows of 7), padded with the adjacent months' days
 * so every row is complete. `weekStartsOn` 0 = Sunday, 1 = Monday.
 */
export function buildMonthGrid({ year, month }: CalendarMonth, weekStartsOn: 0 | 1 = 0): MonthGridCell[][] {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const leading = (first.getUTCDay() - weekStartsOn + 7) % 7;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const totalCells = Math.ceil((leading + daysInMonth) / 7) * 7;

  const weeks: MonthGridCell[][] = [];
  for (let i = 0; i < totalCells; i++) {
    const date = new Date(Date.UTC(year, month - 1, 1 - leading + i));
    const cell: MonthGridCell = {
      dateKey: keyOfUtcDate(date),
      day: date.getUTCDate(),
      inMonth: date.getUTCMonth() === month - 1,
    };
    if (i % 7 === 0) weeks.push([]);
    weeks[weeks.length - 1].push(cell);
  }
  return weeks;
}
