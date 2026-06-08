import { createClient } from '@supabase/supabase-js';
import {
  buildLeaderboard,
  leaderQualifierMinimums,
  getStatDef,
  publicDisplayName,
  memberDisplayName,
  mergeWithThemeDefaults,
  leagueLeaderConfigSchema,
  DEFAULT_LEADER_CONFIG,
  weAreHome,
  type LeaderRow,
  type RankedLeaderRow,
  type StatDef,
  type StatGroup,
  type StatKey,
} from '@baseball/shared';
import {
  groupStandingsByDivision,
  type LeagueDivisionRef,
  type StandingsDivisionGroup,
} from './standings-divisions';
import { getStatValue } from './stat-value';

export { getStatValue } from './stat-value';

/** A standings snapshot row as read for the public league page. */
export interface StandingRow {
  team_id: string | null;
  opponent_team_id: string | null;
  division_id: string | null;
  team_name: string;
  wins: number;
  losses: number;
  ties: number;
  win_pct: number;
  runs_for: number;
  runs_against: number;
}

/** A completed league game summarized from the home team's perspective. */
export interface RecentGame {
  id: string;
  team: string;
  team_id: string;
  opponent: string;
  ourScore: number;
  theirScore: number;
  result: 'W' | 'L' | 'T';
}

export function resolveVisibility(visibility: string, isAuthed: boolean): 'ok' | 'blocked' {
  if (visibility === 'signed_in' && !isAuthed) return 'blocked';
  return 'ok';
}

/** Map player snapshot rows to leaderboard rows, masking names + honoring opt-out for public viewers. */
export function toLeaderRows(snap: any[], statKey: string, isAuthed: boolean): LeaderRow[] {
  const def = getStatDef(statKey as any);
  return snap
    .filter((r) => isAuthed || !r.public_opt_out)
    .map((r) => ({
      id: r.player_id,
      name: isAuthed
        ? memberDisplayName({ firstName: r.first_name, lastName: r.last_name })
        : publicDisplayName({ firstName: r.first_name, lastName: r.last_name }),
      teamName: r.team_name,
      teamId: r.team_id,
      value: getStatValue(r.stats, def.field),
      qualifierValue: def.qualifier === 'ip' ? r.innings_pitched_outs : r.plate_appearances,
    }));
}

/** Raw `games` row fields needed to summarize a completed game from our side. */
export interface RawRecentGame {
  id: string;
  opponent_name: string;
  home_score: number;
  away_score: number;
  location_type: string;
  neutral_home_team?: string | null;
}

/** Summarize a completed game from the home team's perspective (W/L/T + our/their score). */
export function mapRecentGame(g: RawRecentGame, teamName: string, teamId: string): RecentGame {
  const isHome = weAreHome(g.location_type, g.neutral_home_team);
  const ourScore = isHome ? g.home_score : g.away_score;
  const theirScore = isHome ? g.away_score : g.home_score;
  const result: 'W' | 'L' | 'T' = ourScore > theirScore ? 'W' : ourScore < theirScore ? 'L' : 'T';
  return { id: g.id, team: teamName, team_id: teamId, opponent: g.opponent_name, ourScore, theirScore, result };
}

/**
 * Whether a leaderboard row belongs to the viewer's active team. Team boards
 * match on id; player boards match on (case/whitespace-folded) team name. A null
 * ref (public/unauthed viewer) never matches.
 */
export function isOursRow(
  def: Pick<StatDef, 'subject'>,
  row: { id: string; teamName?: string },
  ref: ActiveTeamRef | null,
): boolean {
  if (!ref) return false;
  if (def.subject === 'team') return row.id === ref.id;
  const refName = ref.name?.trim().toLowerCase();
  return !!row.teamName && !!refName && row.teamName.trim().toLowerCase() === refName;
}

/** Bucket already-built boards into their leaderboard tabs by `StatDef.group`. */
export function groupBoardsByCategory(boards: LeaderBoardResult[]): Record<StatGroup, LeaderBoardResult[]> {
  return boards.reduce(
    (acc, b) => {
      acc[b.def.group].push(b);
      return acc;
    },
    { batting: [], pitching: [], team: [], special: [] } as Record<StatGroup, LeaderBoardResult[]>,
  );
}

// Curated default boards, in display order. Each board is routed to a tab by its
// StatDef.group, so this list controls *which* stats appear (and their order)
// while the catalog's `group` field decides the tab. Typed as StatKey[] so an
// unknown/renamed catalog key fails at compile time. League custom boards always
// render under `special`.
const DEFAULT_BOARD_KEYS: StatKey[] = [
  // batting
  'avg', 'obp', 'ops', 'homeRuns', 'rbi', 'hits', 'runs',
  // pitching
  'era', 'whip', 'strikeoutsP',
  // team
  'teamAvg', 'teamEra', 'runsScored', 'runDiff',
  // special
  'qabPct', 'hardHitPct', 'doubles',
];

/** A ranked row enriched for rendering: viewer-team marker + prior-period rank. */
export interface LeaderHomeRow extends RankedLeaderRow {
  /** true when this row belongs to the authenticated viewer's active team */
  ours: boolean;
  /** rank in the previous period (for ▲/▼ deltas); null when unavailable — never fabricated */
  prevRank: number | null;
}

export interface LeaderBoardResult {
  def: StatDef;
  label: string;
  rows: LeaderHomeRow[];
}

/** Active-team identity used to mark "your team" rows for authenticated viewers. */
export interface ActiveTeamRef {
  id: string;
  name: string;
}

export type LeagueHomeData =
  | { notFound: true }
  | { blocked: true; league: { name: string } }
  | {
      ok: true;
      league: { id: string; name: string; logoUrl: string | null; visibility: string };
      theme: ReturnType<typeof mergeWithThemeDefaults>;
      season: string;
      seasons: string[];
      standings: StandingRow[];
      divisions: Array<StandingsDivisionGroup<StandingRow>>;
      defaultBoards: {
        batting: LeaderBoardResult[];
        pitching: LeaderBoardResult[];
        team: LeaderBoardResult[];
        special: LeaderBoardResult[];
      };
      customBoards: LeaderBoardResult[];
      spotlights: any[];
      recent: RecentGame[];
      upcoming: Array<{ id: string; label: string }>;
      counters: { teams: number; games: number };
      /** ISO timestamp of the most recent snapshot row, for the "Updated N ago" pill. */
      updatedAt: string | null;
    };

/** Minimal league identity/visibility lookup for metadata (no snapshot reads). */
export async function getLeagueMeta(slug: string): Promise<{ name: string; visibility: string } | null> {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data, error } = await db.from('leagues').select('name, visibility').eq('slug', slug).maybeSingle();
  if (error) {
    console.error(`[league-home] meta lookup failed slug=${slug}: ${error.message}`);
    return null;
  }
  return data ? { name: data.name, visibility: data.visibility } : null;
}

/** A single public league as shown in the discovery directory at /leagues. */
export interface PublicLeagueListItem {
  slug: string;
  name: string;
  logoUrl: string | null;
  stateCode: string | null;
  leagueType: string | null;
  level: string | null;
}

/**
 * List every league with `visibility = 'public'`, alphabetically by name, for the
 * public discovery directory. Uses the service-role client (anon users cannot SELECT
 * `leagues` under RLS) but only ever exposes the columns below — `signed_in` leagues
 * are excluded by the filter. Degrades to an empty list on error rather than throwing,
 * so the directory page never 500s.
 */
export async function listPublicLeagues(): Promise<PublicLeagueListItem[]> {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data, error } = await db
    .from('leagues')
    .select('slug, name, logo_url, state_code, league_type, level')
    .eq('visibility', 'public')
    .order('name');
  if (error) {
    console.error(`[league-directory] list failed: ${error.message}`);
    return [];
  }
  return (data ?? []).map((leagueRow) => ({
    slug: leagueRow.slug,
    name: leagueRow.name,
    logoUrl: leagueRow.logo_url,
    stateCode: leagueRow.state_code,
    leagueType: leagueRow.league_type,
    level: leagueRow.level,
  }));
}

export async function getLeagueHomeData(
  slug: string,
  isAuthed: boolean,
  seasonParam?: string,
  activeTeam?: ActiveTeamRef | null,
): Promise<LeagueHomeData> {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const { data: league, error: leagueErr } = await db
    .from('leagues')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();
  if (leagueErr) {
    // A query failure is not a 404 — surface it so it's observable.
    console.error(`[league-home] league lookup failed slug=${slug}: ${leagueErr.message}`);
    throw new Error('Failed to load league. Please try again.');
  }
  if (!league) return { notFound: true };
  if (resolveVisibility(league.visibility, isAuthed) === 'blocked') {
    return { blocked: true, league: { name: league.name } };
  }

  const theme = mergeWithThemeDefaults(league.home_theme);
  // Tolerate a malformed leader_config (e.g. hand-edited in the DB) rather than
  // 500 the public page — fall back to defaults.
  const parsedLeader = leagueLeaderConfigSchema.safeParse(league.leader_config ?? {});
  const leaderConfig = parsedLeader.success ? parsedLeader.data : DEFAULT_LEADER_CONFIG;

  // Resolve available seasons (distinct snapshot season names) and the active one.
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
    { data: playerSnap, error: playerErr },
    { data: teamSnap, error: teamErr },
    { data: spots, error: spotsErr },
    { data: leagueDivisions, error: divisionsErr },
  ] = await Promise.all([
    db.from('league_standings_snapshot').select('*').eq('league_id', league.id).eq('season', season),
    db.from('league_player_stat_snapshot').select('*').eq('league_id', league.id).eq('season', season),
    db.from('league_team_stat_snapshot').select('*').eq('league_id', league.id).eq('season', season),
    db.from('league_spotlight_snapshot').select('*').eq('league_id', league.id).eq('season', season),
    db.from('league_divisions').select('id, name').eq('league_id', league.id),
  ]);
  const snapErr = standingsErr || playerErr || teamErr || spotsErr || divisionsErr;
  if (snapErr) {
    console.error(`[league-home] snapshot read failed league=${league.id} season=${season}: ${snapErr.message}`);
    throw new Error('Failed to load league data. Please try again.');
  }

  const standingsSorted = ((standings ?? []) as StandingRow[]).sort((a, b) => b.win_pct - a.win_pct);
  // Per-division breakdown for the public page. Empty when the league has no
  // divisions; unassigned rows appear only in the overall table.
  const divisions = groupStandingsByDivision(standingsSorted, (leagueDivisions ?? []) as LeagueDivisionRef[]);
  // Opponent rows (team_id null) aggregate games against multiple platform teams,
  // so derive games-played metrics from platform rows only — otherwise leaderboard
  // qualifiers and game counts inflate.
  const platformStandings = standingsSorted.filter((r: any) => r.team_id);
  const leagueGames = platformStandings.reduce(
    (max: number, r: any) => Math.max(max, r.wins + r.losses + r.ties),
    0,
  );
  const { paMin, ipOutsMin } = leaderQualifierMinimums(
    leagueGames,
    leaderConfig.qualifierOverrides,
    league.level,
  );

  // "Your team" marking only applies to authenticated viewers with an active team.
  const ourRef: ActiveTeamRef | null = isAuthed ? activeTeam ?? null : null;

  const board = (statKey: string, label?: string, limit = 10): LeaderBoardResult => {
    const def = getStatDef(statKey as any);
    const rows: LeaderRow[] =
      def.subject === 'team'
        ? (teamSnap ?? []).map((t: any) => ({
            id: t.team_id,
            name: t.team_name,
            teamId: t.team_id,
            value: getStatValue(t.stats, def.field),
            qualifierValue: 1,
          }))
        : toLeaderRows(playerSnap ?? [], statKey, isAuthed);
    const minQualifier = def.qualifier === 'ip' ? ipOutsMin : def.qualifier === 'pa' ? paMin : 0;
    const ranked = buildLeaderboard(rows, def, { minQualifier, limit });
    // prevRank is left null for v1 — there is no retained prior-period snapshot to
    // diff against, and the spec forbids fabricating deltas (LEADERBOARD_ALIGNMENT §6).
    const enriched: LeaderHomeRow[] = ranked.map((r) => ({ ...r, ours: isOursRow(def, r, ourRef), prevRank: null }));
    return { def, label: label ?? def.label, rows: enriched };
  };

  // Recent results + upcoming — only platform teams record their own games;
  // opponent teams (team_id null) appear in standings but never as games.team_id.
  const teamIds = platformStandings.map((r: any) => r.team_id);
  let recent: RecentGame[] = [];
  let upcoming: Array<{ id: string; label: string }> = [];
  if (teamIds.length) {
    const teamNameById = new Map<string, string>(standingsSorted.map((r: any) => [r.team_id, r.team_name]));
    const [
      { data: recentGames, error: recentErr },
      { data: upcomingGames, error: upcomingErr },
    ] = await Promise.all([
      db
        .from('games')
        .select('id, team_id, opponent_name, home_score, away_score, location_type, neutral_home_team, scheduled_at')
        .in('team_id', teamIds)
        .eq('status', 'completed')
        .order('scheduled_at', { ascending: false })
        .limit(6),
      db
        .from('games')
        .select('id, team_id, opponent_name, scheduled_at')
        .in('team_id', teamIds)
        .eq('status', 'scheduled')
        .order('scheduled_at', { ascending: true })
        .limit(6),
    ]);
    // Recent/upcoming is a secondary section — log so a regression is observable,
    // but degrade to empty rather than failing the whole page (standings + leaders
    // already loaded). Snapshot reads above still hard-fail since they *are* the page.
    if (recentErr || upcomingErr) {
      console.error(
        `[league-home] games read failed league=${league.id} season=${season} teams=${teamIds.length}: ${(recentErr ?? upcomingErr)!.message}`,
      );
    }
    recent = (recentGames ?? []).map((g: any) => mapRecentGame(g, teamNameById.get(g.team_id) ?? 'Team', g.team_id));
    upcoming = (upcomingGames ?? []).map((g: any) => ({
      id: g.id,
      label: `${teamNameById.get(g.team_id) ?? 'Team'} vs ${g.opponent_name} — ${new Date(g.scheduled_at).toLocaleDateString()}`,
    }));
  }

  // Count games from platform rows only (each league matchup is recorded by both
  // platform teams, hence the /2 below). Opponent inverse records would double-count.
  const totalGames = platformStandings.reduce(
    (s: number, r: any) => s + r.wins + r.losses + r.ties,
    0,
  );

  // Most-recent snapshot write across the loaded tables, for the "Updated N ago" pill.
  const updatedAt =
    [...(standings ?? []), ...(playerSnap ?? []), ...(teamSnap ?? [])]
      .map((r: any) => r.updated_at as string | undefined)
      .filter((t): t is string => !!t)
      .sort((a, b) => b.localeCompare(a))[0] ?? null;

  return {
    ok: true,
    league: { id: league.id, name: league.name, logoUrl: league.logo_url, visibility: league.visibility },
    theme,
    season,
    seasons,
    standings: standingsSorted,
    divisions,
    // Route each curated board into its tab by the catalog's `group` field.
    defaultBoards: groupBoardsByCategory(DEFAULT_BOARD_KEYS.map((key) => board(key))),
    customBoards: leaderConfig.custom.map((c) => board(c.statKey, c.label, c.limit)),
    spotlights: spots ?? [],
    recent,
    upcoming,
    counters: { teams: standingsSorted.length, games: Math.floor(totalGames / 2) },
    updatedAt,
  };
}
