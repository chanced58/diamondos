import { STAT_CATALOG, memberDisplayName, publicDisplayName } from '@baseball/shared';
import { formatStat } from './format-stat';
import { getStatValue } from './load';

/** Build a season-scoped URL to a team's public stat page. */
export function teamHref(slug: string, teamId: string, season?: string): string {
  const base = `/l/${slug}/team/${teamId}`;
  return season ? `${base}?season=${encodeURIComponent(season)}` : base;
}

/** A minimal standings shape used for ranking and name→id mapping. */
export interface RankStandingRow {
  team_id: string | null;
  team_name?: string;
  win_pct: number;
}

/**
 * Rank a team among the league's *platform* teams (rows with a non-null team_id)
 * by win_pct, 1-based and descending. `rank` is null when the team is absent.
 */
export function computeTeamRank(
  standings: RankStandingRow[],
  teamId: string,
): { rank: number | null; total: number } {
  const platform = standings.filter((r) => r.team_id);
  const sorted = [...platform].sort((a, b) => b.win_pct - a.win_pct);
  const idx = sorted.findIndex((r) => r.team_id === teamId);
  return { rank: idx === -1 ? null : idx + 1, total: platform.length };
}

/** Map case/whitespace-folded team names to team ids (skips null-id rows). */
export function teamIdByName(standings: RankStandingRow[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const r of standings) {
    if (r.team_id && r.team_name) map.set(r.team_name.trim().toLowerCase(), r.team_id);
  }
  return map;
}

/** A roster player's display row. `stats` is the raw snapshot blob (read via getStatValue). */
export interface TeamPlayerStatRow {
  playerId: string;
  name: string;
  /** true only for public viewers of an opted-out player; tables blank stat cells when set */
  optedOut: boolean;
  plateAppearances: number;
  inningsPitchedOuts: number;
  stats: unknown;
}

/** Map player snapshot rows to display rows with name masking + opt-out flagging. */
export function toTeamPlayerRows(snap: any[], isAuthed: boolean): TeamPlayerStatRow[] {
  return snap.map((r) => ({
    playerId: r.player_id,
    name: isAuthed
      ? memberDisplayName({ firstName: r.first_name, lastName: r.last_name })
      : publicDisplayName({ firstName: r.first_name, lastName: r.last_name }),
    optedOut: !isAuthed && !!r.public_opt_out,
    plateAppearances: r.plate_appearances ?? 0,
    inningsPitchedOuts: r.innings_pitched_outs ?? 0,
    stats: r.stats,
  }));
}

/** A team-level stat formatted for the stat panel. */
export interface TeamStatItem {
  key: string;
  label: string;
  display: string;
}

/** Build the team-group stat list (catalog order) from a team snapshot `stats` blob. */
export function buildTeamStatList(stats: unknown): TeamStatItem[] {
  return STAT_CATALOG.filter((d) => d.subject === 'team').map((d) => ({
    key: d.key,
    label: d.label,
    display: formatStat(getStatValue(stats, d.field), d.format),
  }));
}
