import { formatSeasonStat, type TeamComparisonRowWire } from '@baseball/shared';
import type { StatColumn } from './StatTable';
import { statValue } from './season-stats-model';

/** The web Team Comparison table's columns. */

/** Winning percentage; 0 with no games (shown ".000", like the web). */
export function winPct(row: Pick<TeamComparisonRowWire, 'wins' | 'losses' | 'ties'>): number {
  const total = row.wins + row.losses + row.ties;
  return total > 0 ? row.wins / total : 0;
}

export const COMPARISON_COLUMNS: StatColumn<TeamComparisonRowWire>[] = [
  { key: 'gamesPlayed', label: 'GP', value: (r) => r.gamesPlayed },
  { key: 'wins', label: 'W', value: (r) => r.wins },
  { key: 'losses', label: 'L', value: (r) => r.losses },
  { key: 'ties', label: 'T', value: (r) => r.ties },
  { key: 'pct', label: 'PCT', value: (r) => formatSeasonStat(winPct(r), 'rate') },
  { key: 'runsScored', label: 'RS', value: (r) => r.runsScored },
  { key: 'runsAllowed', label: 'RA', value: (r) => r.runsAllowed },
  { key: 'teamAvg', label: 'AVG', value: (r) => formatSeasonStat(r.teamAvg, 'rate') },
  { key: 'teamEra', label: 'ERA', value: (r) => formatSeasonStat(r.teamEra, 'dec') },
  { key: 'totalHits', label: 'H', value: (r) => r.totalHits },
  { key: 'totalStrikeouts', label: 'K', value: (r) => r.totalStrikeouts },
];

export function comparisonSortValue(row: TeamComparisonRowWire, key: string): number | null {
  return key === 'pct' ? winPct(row) : statValue(row, key);
}
