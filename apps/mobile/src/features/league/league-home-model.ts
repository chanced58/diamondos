import { formatDate, type LeagueHomeStandingRow, type LeagueTeamPlayerTable } from '@baseball/shared';
import type { StatColumn } from '../stats/StatTable';
import { NAME_COLUMN_KEY } from '../stats/StatTable';
import type { SortState } from '../stats/season-stats-model';

/** The league home's and team page's tables and labels, as pure data. */

type PlayerRow = LeagueTeamPlayerTable['rows'][number];

/** ".750", "1.000", or "—" before a game. */
export function formatWinPct(row: Pick<LeagueHomeStandingRow, 'wins' | 'losses' | 'ties' | 'winPct'>): string {
  if (row.wins + row.losses + row.ties === 0) return '—';
  return row.winPct.toFixed(3).replace(/^0/, '');
}

/** "7-3" or "7-3-1" with ties. */
export function formatRecord(row: { wins: number; losses: number; ties: number }): string {
  return row.ties > 0 ? `${row.wins}-${row.losses}-${row.ties}` : `${row.wins}-${row.losses}`;
}

/** The public standings table's columns. */
export const HOME_STANDINGS_COLUMNS: StatColumn<LeagueHomeStandingRow>[] = [
  { key: 'w', label: 'W', value: (r) => r.wins },
  { key: 'l', label: 'L', value: (r) => r.losses },
  { key: 't', label: 'T', value: (r) => r.ties },
  { key: 'pct', label: 'PCT', value: formatWinPct },
  { key: 'rf', label: 'RF', value: (r) => r.runsFor },
  { key: 'ra', label: 'RA', value: (r) => r.runsAgainst },
];

/** "Updated Oct 25", or null when the league has no snapshot yet. */
export function updatedLabel(updatedAt: string | null): string | null {
  return updatedAt ? `Updated ${formatDate(updatedAt)}` : null;
}

/** A player table's stat columns for `StatTable`, showing each cell's text. */
export function playerTableColumns(table: LeagueTeamPlayerTable): StatColumn<PlayerRow>[] {
  return table.columns.map((c) => ({ key: c.key, label: c.label, value: (row) => row.cells[c.key]?.display ?? '—' }));
}

/** A player table first sorted on its lead column (PA or IP), best first, as on the web. */
export function defaultPlayerSort(table: LeagueTeamPlayerTable): SortState {
  const lead = table.columns[0];
  return { key: lead?.key ?? NAME_COLUMN_KEY, ascending: lead?.sortDir === 'asc' };
}

/** Tapping a column: the same column flips; a new one starts best first (names A–Z). */
export function nextPlayerSort(table: LeagueTeamPlayerTable, current: SortState, key: string): SortState {
  if (current.key === key) return { key, ascending: !current.ascending };
  if (key === NAME_COLUMN_KEY) return { key, ascending: true };
  return { key, ascending: table.columns.find((c) => c.key === key)?.sortDir === 'asc' };
}

/**
 * Rows in the chosen order, as the web table sorts them: names over every
 * row; a stat over the visible rows, ties by name, with players whose stats
 * are hidden pinned below by name so a hidden value never moves them.
 */
export function sortPlayerRows(rows: PlayerRow[], sort: SortState): PlayerRow[] {
  const direction = sort.ascending ? 1 : -1;
  if (sort.key === NAME_COLUMN_KEY) return [...rows].sort((a, b) => direction * a.name.localeCompare(b.name));
  const visible = rows.filter((r) => !r.optedOut);
  const hidden = rows.filter((r) => r.optedOut).sort((a, b) => a.name.localeCompare(b.name));
  visible.sort((a, b) => {
    const d = direction * ((a.cells[sort.key]?.value ?? 0) - (b.cells[sort.key]?.value ?? 0));
    return d !== 0 ? d : a.name.localeCompare(b.name);
  });
  return [...visible, ...hidden];
}
