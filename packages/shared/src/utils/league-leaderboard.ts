import type { StatDef } from '../constants/stat-catalog';

export interface LeaderRow {
  id: string; name: string; value: number; qualifierValue: number; teamName?: string; teamId?: string;
  /** PA for batting/special stats, IP outs for pitching stats; omitted for team rows (always eligible). */
  activity?: number;
}
export interface RankedLeaderRow extends LeaderRow { rank: number; }
export interface BuildOpts { minQualifier: number; limit: number; }

/**
 * Per-game qualifier rates for rate-stat leaderboards (AVG/OBP, ERA/WHIP),
 * keyed by a league's competition `level`.
 *
 * Professional leagues use the real MLB qualified-player thresholds. Every other
 * level (youth/HS/college/etc.) uses a lower bar: amateur rosters rotate far more
 * aggressively — NFHS pitch-count limits cap how long any one arm throws — so the
 * MLB 1.0 IP/game bar collapses the ERA/WHIP boards to a single workhorse.
 * A league can still override either rate via `leader_config.qualifierOverrides`.
 */
export const PRO_PA_PER_GAME = 3.1;
export const PRO_IP_PER_GAME = 1.0;
export const DEFAULT_PA_PER_GAME = 2.0;
export const DEFAULT_IP_PER_GAME = 0.5;

export interface QualifierOverrides {
  paPerGame?: number;
  ipPerGame?: number;
}

/** A league's `level` (see leagues.level) counts as professional when 'pro'. */
export function isProfessionalLevel(level?: string | null): boolean {
  return level === 'pro';
}

/**
 * Minimum plate appearances and innings pitched (expressed in outs) a player
 * must reach to appear on a rate-stat leaderboard, scaled by the number of
 * games the league has played. Professional leagues (`level === 'pro'`) use the
 * MLB qualified-player bar; all other levels use the lower amateur bar.
 * Explicit per-league `overrides` take precedence over the level default.
 */
export function leaderQualifierMinimums(
  leagueGames: number,
  overrides: QualifierOverrides = {},
  level?: string | null,
): { paMin: number; ipOutsMin: number } {
  const pro = isProfessionalLevel(level);
  const paPerGame = overrides.paPerGame ?? (pro ? PRO_PA_PER_GAME : DEFAULT_PA_PER_GAME);
  const ipPerGame = overrides.ipPerGame ?? (pro ? PRO_IP_PER_GAME : DEFAULT_IP_PER_GAME);
  return { paMin: paPerGame * leagueGames, ipOutsMin: ipPerGame * leagueGames * 3 };
}

/** All eligible rows, ranked (ties share a rank, shown in name order). No limit. */
export function rankLeaderRows(
  rows: LeaderRow[],
  stat: Pick<StatDef, 'sortDir' | 'isRate' | 'qualifier'>,
  minQualifier: number,
): RankedLeaderRow[] {
  const eligible = rows.filter(
    (r) =>
      (r.activity === undefined || r.activity > 0) &&
      (!stat.isRate || stat.qualifier === 'none' || r.qualifierValue >= minQualifier),
  );
  const sorted = [...eligible].sort((a, b) => {
    const diff = stat.sortDir === 'asc' ? a.value - b.value : b.value - a.value;
    return diff !== 0 ? diff : a.name.localeCompare(b.name);
  });
  const ranked: RankedLeaderRow[] = [];
  let lastValue: number | null = null;
  let lastRank = 0;
  sorted.forEach((row, i) => {
    const rank = lastValue !== null && row.value === lastValue ? lastRank : i + 1;
    ranked.push({ ...row, rank });
    lastValue = row.value; lastRank = rank;
  });
  return ranked;
}

export function buildLeaderboard(rows: LeaderRow[], stat: StatDef, opts: BuildOpts): RankedLeaderRow[] {
  return rankLeaderRows(rows, stat, opts.minQualifier).slice(0, opts.limit);
}
