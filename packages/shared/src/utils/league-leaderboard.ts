import type { StatDef } from '../constants/stat-catalog';

export interface LeaderRow {
  id: string; name: string; value: number; qualifierValue: number; teamName?: string;
}
export interface RankedLeaderRow extends LeaderRow { rank: number; }
export interface BuildOpts { minQualifier: number; limit: number; }

/**
 * Per-game qualifier rates for rate-stat leaderboards (AVG/OBP, ERA/WHIP).
 * MLB uses ~3.1 PA and 1.0 IP per team game, but high-school rosters rotate far
 * more aggressively — NFHS pitch-count limits cap how long any one arm throws —
 * so a 1.0 IP/game bar collapses the ERA/WHIP boards to a single workhorse.
 * These HS-calibrated defaults keep the boards meaningful; a league can still
 * override either via `leader_config.qualifierOverrides`.
 */
export const DEFAULT_PA_PER_GAME = 2.0;
export const DEFAULT_IP_PER_GAME = 0.5;

export interface QualifierOverrides {
  paPerGame?: number;
  ipPerGame?: number;
}

/**
 * Minimum plate appearances and innings pitched (expressed in outs) a player
 * must reach to appear on a rate-stat leaderboard, scaled by the number of
 * games the league has played.
 */
export function leaderQualifierMinimums(
  leagueGames: number,
  overrides: QualifierOverrides = {},
): { paMin: number; ipOutsMin: number } {
  const paMin = (overrides.paPerGame ?? DEFAULT_PA_PER_GAME) * leagueGames;
  const ipOutsMin = (overrides.ipPerGame ?? DEFAULT_IP_PER_GAME) * leagueGames * 3;
  return { paMin, ipOutsMin };
}

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
