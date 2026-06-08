import { cellValue, cellDisplay, sortPlayerRows, type SortColumnSpec } from '../team-table-sort';
import type { TeamPlayerStatRow } from '../team-load';

const avgCol: SortColumnSpec = { key: 'avg', label: 'AVG', source: 'stat', field: 'avg', format: 'avg3', sortDir: 'desc' };
const eraCol: SortColumnSpec = { key: 'era', label: 'ERA', source: 'stat', field: 'era', format: 'ratio2', sortDir: 'asc' };
const nameCol: SortColumnSpec = { key: 'name', label: 'Player', source: 'name', field: '', format: 'int', sortDir: 'asc' };

type RowInput = Omit<Partial<TeamPlayerStatRow>, 'plateAppearances' | 'inningsPitchedOuts' | 'stats'> & {
  playerId: string;
  name: string;
  plateAppearances?: number | null;
  inningsPitchedOuts?: number | null;
  stats?: unknown;
};

function row(p: RowInput): TeamPlayerStatRow {
  return {
    optedOut: false, pitched: false, plateAppearances: 0, inningsPitchedOuts: 0, stats: {},
    ...p,
  } as TeamPlayerStatRow;
}

describe('cellValue', () => {
  it('reads PA, IP, and stat-field values', () => {
    expect(cellValue(row({ playerId: 'a', name: 'A', plateAppearances: 12 }), { ...avgCol, source: 'pa' })).toBe(12);
    expect(cellValue(row({ playerId: 'a', name: 'A', inningsPitchedOuts: 9 }), { ...avgCol, source: 'ip' })).toBe(9);
    expect(cellValue(row({ playerId: 'a', name: 'A', stats: { avg: 0.4 } }), avgCol)).toBe(0.4);
  });
});

describe('cellDisplay', () => {
  it('blanks every cell for opted-out rows', () => {
    const p = row({ playerId: 'x', name: 'X', optedOut: true, plateAppearances: null, inningsPitchedOuts: null, stats: null });
    expect(cellDisplay(p, avgCol)).toBe('—');
    expect(cellDisplay(p, { ...avgCol, source: 'pa' })).toBe('—');
  });
  it('formats visible values per the column format', () => {
    const p = row({ playerId: 'y', name: 'Y', stats: { avg: 0.351 } });
    expect(cellDisplay(p, avgCol)).toBe('.351');
  });
});

describe('sortPlayerRows', () => {
  const rows = [
    row({ playerId: 'a', name: 'Alice', stats: { avg: 0.2 } }),
    row({ playerId: 'b', name: 'Bob', stats: { avg: 0.4 } }),
    row({ playerId: 'c', name: 'Cara', stats: { avg: 0.3 } }),
  ];

  it('sorts by a stat descending (best-first)', () => {
    expect(sortPlayerRows(rows, avgCol, 'desc').map((r) => r.playerId)).toEqual(['b', 'c', 'a']);
  });
  it('sorts ascending when direction is asc (e.g. ERA lower-is-better)', () => {
    const era = [
      row({ playerId: 'a', name: 'Alice', stats: { era: 3.0 } }),
      row({ playerId: 'b', name: 'Bob', stats: { era: 1.0 } }),
    ];
    expect(sortPlayerRows(era, eraCol, 'asc').map((r) => r.playerId)).toEqual(['b', 'a']);
  });
  it('pins opted-out rows to the bottom regardless of their hidden value', () => {
    const mixed = [
      row({ playerId: 'a', name: 'Alice', stats: { avg: 0.2 } }),
      row({ playerId: 'z', name: 'Zoe', optedOut: true, stats: { avg: 0.9 } }), // hidden .900 must NOT float to top
      row({ playerId: 'b', name: 'Bob', stats: { avg: 0.4 } }),
    ];
    expect(sortPlayerRows(mixed, avgCol, 'desc').map((r) => r.playerId)).toEqual(['b', 'a', 'z']);
  });
  it('sorts the name column over all rows, including opted-out (not pinned)', () => {
    const mixed = [
      row({ playerId: 'c', name: 'Cara' }),
      row({ playerId: 'opt', name: 'Aaron', optedOut: true }), // sorts FIRST despite opt-out
      row({ playerId: 'a', name: 'Alice' }),
    ];
    expect(sortPlayerRows(mixed, nameCol, 'asc').map((r) => r.playerId)).toEqual(['opt', 'a', 'c']);
  });
  it('breaks numeric ties by name for determinism', () => {
    const tied = [
      row({ playerId: 'b', name: 'Bob', stats: { avg: 0.3 } }),
      row({ playerId: 'a', name: 'Alice', stats: { avg: 0.3 } }),
    ];
    expect(sortPlayerRows(tied, avgCol, 'desc').map((r) => r.playerId)).toEqual(['a', 'b']);
  });
});
