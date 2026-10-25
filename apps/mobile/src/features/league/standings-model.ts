import type { StandingsTeamRow } from '@baseball/shared';
import type { StatColumn } from '../stats/StatTable';
import { sortStatRows, type SortState } from '../stats/season-stats-model';

/**
 * The League screen's standings table: the web StandingsBoard's columns, as
 * text that fits a phone cell, and its sort (each column's first direction
 * puts the better teams on top).
 */

/** ".667", or "—" before a team has played. */
export function formatPct(row: Pick<StandingsTeamRow, 'pct' | 'gamesPlayed'>): string {
  if (row.gamesPlayed === 0) return '—';
  return row.pct.toFixed(3).replace(/^0/, '');
}

/** "+4", "-2" or "0". */
export function formatDiff(diff: number): string {
  return diff > 0 ? `+${diff}` : String(diff);
}

/** "W3", or "—" without a game. */
export function formatStreak(streak: StandingsTeamRow['streak']): string {
  return streak ? `${streak.type}${streak.count}` : '—';
}

/** The last five results run together, oldest first: "WWLTW". */
export function formatLast5(last5: StandingsTeamRow['last5']): string {
  return last5.length > 0 ? last5.join('') : '—';
}

export const STANDINGS_COLUMNS: StatColumn<StandingsTeamRow>[] = [
  { key: 'wins', label: 'W', value: (r) => r.wins },
  { key: 'losses', label: 'L', value: (r) => r.losses },
  { key: 'pct', label: 'PCT', value: formatPct },
  { key: 'rf', label: 'RF', value: (r) => r.rf },
  { key: 'ra', label: 'RA', value: (r) => r.ra },
  { key: 'diff', label: 'DIFF', value: (r) => formatDiff(r.diff), emphasize: (r) => r.diff < 0 },
  { key: 'streak', label: 'STRK', value: (r) => formatStreak(r.streak) },
  { key: 'last5', label: 'L5', value: (r) => formatLast5(r.last5) },
];

/** Columns where fewer is better, so their first tap sorts low to high, as on the web. */
const ASCENDING_FIRST = new Set(['losses', 'ra']);

/** Standings as the web shows them first: best win percentage, then most wins. */
export const DEFAULT_STANDINGS_SORT: SortState = { key: 'pct', ascending: false };

/** Tapping a column: the same column flips; a new one starts on its better-first direction. */
export function nextStandingsSort(current: SortState, key: string): SortState {
  if (current.key === key) return { key, ascending: !current.ascending };
  return { key, ascending: key === 'name' || ASCENDING_FIRST.has(key) };
}

/** A row's sortable value; streaks and form lines rank by length of winning, then by wins. */
function sortValue(row: StandingsTeamRow, key: string): number | null {
  switch (key) {
    case 'wins':
    case 'losses':
    case 'rf':
    case 'ra':
    case 'diff':
      return row[key];
    case 'pct':
      // Ties on percentage go to the team with more wins.
      return row.gamesPlayed === 0 ? null : row.pct + row.wins / 1e6;
    case 'streak':
      if (!row.streak) return null;
      return row.streak.type === 'W' ? row.streak.count : row.streak.type === 'L' ? -row.streak.count : 0;
    case 'last5':
      return row.last5.length === 0 ? null : row.last5.filter((r) => r === 'W').length;
    default:
      return null;
  }
}

/** A division's teams in the chosen order. */
export function sortStandings(rows: StandingsTeamRow[], sort: SortState): StandingsTeamRow[] {
  return sortStatRows(rows, sort, (r) => r.name, sortValue);
}
