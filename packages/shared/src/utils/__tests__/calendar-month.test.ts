import { buildMonthGrid, monthDateRange, monthOfDateKey, shiftMonth } from '../calendar-month';

describe('buildMonthGrid', () => {
  it('should pad October 2026 into full Sunday-first weeks', () => {
    // Oct 1, 2026 is a Thursday.
    const weeks = buildMonthGrid({ year: 2026, month: 10 });
    expect(weeks).toHaveLength(5);
    expect(weeks.every((week) => week.length === 7)).toBe(true);
    expect(weeks[0][0]).toEqual({ dateKey: '2026-09-27', day: 27, inMonth: false });
    expect(weeks[0][4]).toEqual({ dateKey: '2026-10-01', day: 1, inMonth: true });
    expect(weeks[4][6]).toEqual({ dateKey: '2026-10-31', day: 31, inMonth: true });
  });

  it('should start weeks on Monday when asked', () => {
    const weeks = buildMonthGrid({ year: 2026, month: 10 }, 1);
    expect(weeks[0][0].dateKey).toBe('2026-09-28');
    expect(weeks[0][3].dateKey).toBe('2026-10-01');
  });

  it('should handle a leap-year February and a month spanning six weeks', () => {
    const feb = buildMonthGrid({ year: 2028, month: 2 });
    expect(feb.flat().filter((cell) => cell.inMonth)).toHaveLength(29);
    // Aug 2026 starts on Saturday and has 31 days: six rows.
    expect(buildMonthGrid({ year: 2026, month: 8 })).toHaveLength(6);
  });

  it('should keep the same days across a DST change', () => {
    // US DST ends Nov 1, 2026; UTC math must not duplicate or skip a day.
    const keys = buildMonthGrid({ year: 2026, month: 11 }).flat().filter((c) => c.inMonth).map((c) => c.day);
    expect(keys).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
  });
});

describe('month helpers', () => {
  it('should shift across year boundaries in both directions', () => {
    expect(shiftMonth({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
    expect(shiftMonth({ year: 2026, month: 3 }, -15)).toEqual({ year: 2024, month: 12 });
  });

  it('should give the first and last day of a month', () => {
    expect(monthDateRange({ year: 2026, month: 2 })).toEqual({ first: '2026-02-01', last: '2026-02-28' });
    expect(monthOfDateKey('2026-10-21')).toEqual({ year: 2026, month: 10 });
  });
});
