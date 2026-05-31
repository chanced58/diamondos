import type { StatDef } from '../constants/stat-catalog';

export interface LeaderRow {
  id: string; name: string; value: number; qualifierValue: number; teamName?: string;
}
export interface RankedLeaderRow extends LeaderRow { rank: number; }
export interface BuildOpts { minQualifier: number; limit: number; }

export function buildLeaderboard(rows: LeaderRow[], stat: StatDef, opts: BuildOpts): RankedLeaderRow[] {
  const eligible = stat.qualifier === 'none' || !stat.isRate
    ? rows
    : rows.filter((r) => r.qualifierValue >= opts.minQualifier);
  const sorted = [...eligible].sort((a, b) => (stat.sortDir === 'asc' ? a.value - b.value : b.value - a.value));
  const ranked: RankedLeaderRow[] = [];
  let lastValue: number | null = null;
  let lastRank = 0;
  sorted.forEach((row, i) => {
    const rank = lastValue !== null && row.value === lastValue ? lastRank : i + 1;
    ranked.push({ ...row, rank });
    lastValue = row.value; lastRank = rank;
  });
  return ranked.slice(0, opts.limit);
}
