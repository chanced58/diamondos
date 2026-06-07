import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { STAT_CATALOG, memberDisplayName, publicDisplayName, mergeWithThemeDefaults } from '@baseball/shared';
import { formatStat } from './format-stat';
import { getStatValue, resolveVisibility } from './load';

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

/** Batting columns for the team page, in display order. */
export const TEAM_BATTING_KEYS = [
  'avg', 'obp', 'slg', 'ops', 'homeRuns', 'rbi', 'hits', 'runs',
  'doubles', 'triples', 'walks', 'qabPct', 'hardHitPct',
] as const;

/** Pitching columns for the team page, in display order (IP rendered separately). */
export const TEAM_PITCHING_KEYS = ['era', 'whip', 'strikeoutsP'] as const;

export interface TeamRecord {
  wins: number; losses: number; ties: number; winPct: number;
  runsFor: number; runsAgainst: number;
}

export type TeamStatPageData =
  | { notFound: true }
  | { blocked: true; league: { name: string }; slug: string }
  | {
      ok: true;
      slug: string;
      league: { id: string; name: string };
      theme: ReturnType<typeof mergeWithThemeDefaults>;
      season: string;
      team: { id: string; name: string; logoUrl: string | null };
      record: TeamRecord;
      rank: { rank: number | null; total: number };
      divisionName: string | null;
      teamStats: TeamStatItem[];
      players: TeamPlayerStatRow[];
    };

/** Lightweight identity/visibility lookup for team-page metadata (no snapshot reads). */
export async function getTeamMeta(
  slug: string,
  teamId: string,
): Promise<{ leagueName: string; visibility: string; teamName: string } | null> {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data: league, error } = await db
    .from('leagues')
    .select('name, visibility')
    .eq('slug', slug)
    .maybeSingle();
  if (error) {
    console.error(`[team-page] meta lookup failed slug=${slug}: ${error.message}`);
    return null;
  }
  if (!league) return null;
  const { data: team } = await db.from('teams').select('name').eq('id', teamId).maybeSingle();
  return { leagueName: league.name, visibility: league.visibility, teamName: team?.name ?? 'Team' };
}

export async function getTeamStatPageData(
  slug: string,
  teamId: string,
  isAuthed: boolean,
  seasonParam?: string,
): Promise<TeamStatPageData> {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const { data: league, error: leagueErr } = await db
    .from('leagues')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();
  if (leagueErr) {
    console.error(`[team-page] league lookup failed slug=${slug}: ${leagueErr.message}`);
    throw new Error('Failed to load team. Please try again.');
  }
  if (!league) return { notFound: true };
  if (resolveVisibility(league.visibility, isAuthed) === 'blocked') {
    return { blocked: true, league: { name: league.name }, slug };
  }

  const theme = mergeWithThemeDefaults(league.home_theme);

  const { data: seasonRows } = await db
    .from('league_standings_snapshot')
    .select('season')
    .eq('league_id', league.id);
  const seasons = Array.from(new Set((seasonRows ?? []).map((r: { season: string }) => r.season))).sort((a, b) =>
    b.localeCompare(a),
  );
  const season = seasonParam ?? league.current_season ?? seasons[0] ?? '';

  const [
    { data: standings, error: standingsErr },
    { data: teamRow, error: teamStatErr },
    { data: playerSnap, error: playerErr },
    { data: teamMeta, error: teamMetaErr },
  ] = await Promise.all([
    db.from('league_standings_snapshot').select('*').eq('league_id', league.id).eq('season', season),
    db
      .from('league_team_stat_snapshot')
      .select('*')
      .eq('league_id', league.id)
      .eq('season', season)
      .eq('team_id', teamId)
      .maybeSingle(),
    db.from('league_player_stat_snapshot').select('*').eq('league_id', league.id).eq('season', season).eq('team_id', teamId),
    db.from('teams').select('id, name, logo_url').eq('id', teamId).maybeSingle(),
  ]);
  const snapErr = standingsErr || teamStatErr || playerErr || teamMetaErr;
  if (snapErr) {
    console.error(`[team-page] snapshot read failed league=${league.id} team=${teamId} season=${season}: ${snapErr.message}`);
    throw new Error('Failed to load team data. Please try again.');
  }

  const allStandings = (standings ?? []) as any[];
  const standingRow = allStandings.find((r) => r.team_id === teamId);
  const players = toTeamPlayerRows(playerSnap ?? [], isAuthed);

  // A team unknown to this league/season has no record, no stat row, and no roster.
  if (!standingRow && !teamRow && players.length === 0) return { notFound: true };

  // Resolve division name (only if the standings row carries a division_id).
  let divisionName: string | null = null;
  if (standingRow?.division_id) {
    const { data: div } = await db
      .from('league_divisions')
      .select('name')
      .eq('id', standingRow.division_id)
      .maybeSingle();
    divisionName = div?.name ?? null;
  }

  const teamName = teamMeta?.name ?? standingRow?.team_name ?? 'Team';
  const record: TeamRecord = {
    wins: standingRow?.wins ?? 0,
    losses: standingRow?.losses ?? 0,
    ties: standingRow?.ties ?? 0,
    winPct: standingRow?.win_pct ?? 0,
    runsFor: standingRow?.runs_for ?? 0,
    runsAgainst: standingRow?.runs_against ?? 0,
  };

  // Sort batting by playing time (PA desc) and pitching by workload (IP desc) — never
  // by a hidden stat, so opted-out public rows don't leak an ordering signal.
  players.sort((a, b) => b.plateAppearances - a.plateAppearances);

  return {
    ok: true,
    slug,
    league: { id: league.id, name: league.name },
    theme,
    season,
    team: { id: teamId, name: teamName, logoUrl: teamMeta?.logo_url ?? null },
    record,
    rank: computeTeamRank(allStandings, teamId),
    divisionName,
    teamStats: buildTeamStatList(teamRow?.stats ?? {}),
    players,
  };
}
