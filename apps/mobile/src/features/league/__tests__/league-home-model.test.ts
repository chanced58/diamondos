import type { LeagueTeamPlayerTable } from '@baseball/shared';
import { defaultPlayerSort, formatRecord, formatWinPct, nextPlayerSort, sortPlayerRows } from '../league-home-model';

const table: LeagueTeamPlayerTable = {
  columns: [
    { key: 'pa', label: 'PA', sortDir: 'desc' },
    { key: 'era', label: 'ERA', sortDir: 'asc' },
  ],
  rows: [
    { playerId: 'a', name: 'Ann', optedOut: false, cells: { pa: { value: 10, display: '10' }, era: { value: 3.2, display: '3.20' } } },
    { playerId: 'h', name: 'Hal', optedOut: true, cells: { pa: { value: null, display: '—' }, era: { value: null, display: '—' } } },
    { playerId: 'b', name: 'Bo', optedOut: false, cells: { pa: { value: 25, display: '25' }, era: { value: 1.1, display: '1.10' } } },
    { playerId: 'c', name: 'Cy', optedOut: false, cells: { pa: { value: 10, display: '10' }, era: { value: 5, display: '5.00' } } },
  ],
};
const names = (rows: LeagueTeamPlayerTable['rows']) => rows.map((r) => r.name);

describe('league home model', () => {
  it('should word records and win percentages', () => {
    expect(formatRecord({ wins: 7, losses: 3, ties: 0 })).toBe('7-3');
    expect(formatRecord({ wins: 7, losses: 3, ties: 1 })).toBe('7-3-1');
    expect(formatWinPct({ wins: 3, losses: 1, ties: 0, winPct: 0.75 })).toBe('.750');
    expect(formatWinPct({ wins: 0, losses: 0, ties: 0, winPct: 0 })).toBe('—');
  });

  it('should sort a player table best first, ties by name, hidden players last', () => {
    expect(defaultPlayerSort(table)).toEqual({ key: 'pa', ascending: false });
    expect(names(sortPlayerRows(table.rows, defaultPlayerSort(table)))).toEqual(['Bo', 'Ann', 'Cy', 'Hal']);

    // ERA is best low, so its first tap sorts low to high; Hal stays last either way.
    const era = nextPlayerSort(table, defaultPlayerSort(table), 'era');
    expect(era).toEqual({ key: 'era', ascending: true });
    expect(names(sortPlayerRows(table.rows, era))).toEqual(['Bo', 'Ann', 'Cy', 'Hal']);
    expect(names(sortPlayerRows(table.rows, nextPlayerSort(table, era, 'era')))).toEqual(['Cy', 'Ann', 'Bo', 'Hal']);

    // A visible player without a value sorts after the numbers either way.
    const withGap = [...table.rows, { playerId: 'n', name: 'Ned', optedOut: false, cells: { era: { value: null, display: '—' } } }];
    expect(names(sortPlayerRows(withGap, era)).slice(-2)).toEqual(['Ned', 'Hal']);
    expect(names(sortPlayerRows(withGap, { key: 'era', ascending: false })).slice(-2)).toEqual(['Ned', 'Hal']);

    // Names sort every row, hidden ones included.
    expect(names(sortPlayerRows(table.rows, nextPlayerSort(table, era, 'name')))).toEqual(['Ann', 'Bo', 'Cy', 'Hal']);
  });
});
