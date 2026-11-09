import {
  DEFAULT_LEADER_CONFIG,
  leagueLeaderConfigSchema,
  leaderQualifierMinimums,
  type LeagueLeaderConfig,
  type SectionId,
  type mergeWithThemeDefaults,
} from '@baseball/shared';

/**
 * Resolve the available seasons (distinct, newest first) and the active one:
 * explicit param, else the league's current season, else the newest snapshot.
 */
export function resolveSeason(
  seasonRows: Array<{ season: string }>,
  currentSeason: string | null,
  seasonParam?: string,
): { season: string; seasons: string[] } {
  const seasons = Array.from(new Set(seasonRows.map((r) => r.season))).sort((a, b) => b.localeCompare(a));
  const season = seasonParam ?? currentSeason ?? seasons[0] ?? '';
  return { season, seasons };
}

/** Ids of the home-page sections the league has enabled. */
export function enabledSections(theme: ReturnType<typeof mergeWithThemeDefaults>): Set<SectionId> {
  return new Set(theme.sections.filter((s) => s.enabled).map((s) => s.id));
}

/**
 * Parse the league's leader config (tolerating a malformed, hand-edited value by
 * falling back to defaults) and compute the PA / IP-outs qualifier minimums.
 * `platformStandings` must be platform-team rows only (non-null team_id): opponent
 * rows aggregate games against several teams and would inflate the game count.
 */
export function qualifierMinsFor(
  platformStandings: Array<{ wins: number; losses: number; ties: number }>,
  leaderConfigRaw: unknown,
  level: string | null,
): { paMin: number; ipOutsMin: number; leaderConfig: LeagueLeaderConfig } {
  const parsed = leagueLeaderConfigSchema.safeParse(leaderConfigRaw ?? {});
  const leaderConfig = parsed.success ? parsed.data : DEFAULT_LEADER_CONFIG;
  const leagueGames = platformStandings.reduce((max, r) => Math.max(max, r.wins + r.losses + r.ties), 0);
  const { paMin, ipOutsMin } = leaderQualifierMinimums(leagueGames, leaderConfig.qualifierOverrides, level);
  return { paMin, ipOutsMin, leaderConfig };
}
