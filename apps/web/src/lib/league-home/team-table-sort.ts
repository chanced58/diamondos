import { getStatValue } from './stat-value';
import { formatStat, type StatFormat } from './format-stat';
import type { TeamPlayerStatRow } from './team-load';
import { getStatDef, type StatKey } from '@baseball/shared';

export interface SortColumnSpec {
  key: string; // 'name' | 'pa' | 'ip' | <stat key>
  label: string;
  source: 'name' | 'pa' | 'ip' | 'stat';
  field: string; // dot-path into stats (source === 'stat'); '' otherwise
  format: StatFormat;
  sortDir: 'asc' | 'desc'; // natural best-first direction
}

/** Numeric sort value for a row in a column. Opted-out rows yield 0 but are never
 *  ordered by it — sortPlayerRows pins them to the bottom. */
export function cellValue(p: TeamPlayerStatRow, col: SortColumnSpec): number {
  if (col.source === 'pa') return p.plateAppearances ?? 0;
  if (col.source === 'ip') return p.inningsPitchedOuts ?? 0;
  return getStatValue(p.stats, col.field);
}

/** Display string for a cell. Opted-out rows render '—' for every numeric column. */
export function cellDisplay(p: TeamPlayerStatRow, col: SortColumnSpec): string {
  if (p.optedOut) return '—';
  if (col.source === 'pa') return formatStat(p.plateAppearances ?? 0, 'int');
  if (col.source === 'ip') return formatStat(p.inningsPitchedOuts ?? 0, 'ip');
  return formatStat(getStatValue(p.stats, col.field), col.format);
}

/** Sort rows for the active column + direction.
 *  - name column: alphabetical over ALL rows (names are visible to everyone).
 *  - numeric column: non-opted-out rows sorted by value; opted-out rows pinned to the
 *    bottom (sorted by name), so a hidden value never affects position.
 *  Ties break by name for determinism. */
export function sortPlayerRows(
  rows: TeamPlayerStatRow[],
  col: SortColumnSpec,
  dir: 'asc' | 'desc',
): TeamPlayerStatRow[] {
  const mul = dir === 'asc' ? 1 : -1;
  if (col.source === 'name') {
    return [...rows].sort((a, b) => a.name.localeCompare(b.name) * mul);
  }
  const visible = rows.filter((r) => !r.optedOut);
  const hidden = rows.filter((r) => r.optedOut).sort((a, b) => a.name.localeCompare(b.name));
  visible.sort((a, b) => {
    const d = (cellValue(a, col) - cellValue(b, col)) * mul;
    return d !== 0 ? d : a.name.localeCompare(b.name);
  });
  return [...visible, ...hidden];
}

/** Build a column list for a player stat table: a leading numeric column (PA/IP)
 *  followed by one column per catalog stat key. */
export function toStatColumns(lead: SortColumnSpec, statKeys: readonly StatKey[]): SortColumnSpec[] {
  return [
    lead,
    ...statKeys.map((k) => {
      const d = getStatDef(k);
      return { key: d.key, label: d.label, source: 'stat' as const, field: d.field, format: d.format, sortDir: d.sortDir };
    }),
  ];
}
