import 'server-only';
import type { Database } from '@baseball/database';
import { createClient } from '@supabase/supabase-js';
import {
  publicDisplayName,
  memberDisplayName,
  mergeWithThemeDefaults,
} from '@baseball/shared';
import {
  resolveVisibility,
  type StandingRow,
  type ActiveTeamRef,
} from '../league-home/load';
import { computeTeamRank, compareStandings } from '../league-home/team-load';
import { resolveSeason, enabledSections, qualifierMinsFor } from '../league-home/league-context';
import { BATTING_COLUMNS, PITCHING_COLUMNS } from './columns';
import { computeRankTable, type StatsPlayer, type RankTable } from './ranks';

export type PlayerSnapshotRow = Database['public']['Tables']['league_player_stat_snapshot']['Row'];
export type TeamSnapshotRow = Database['public']['Tables']['league_team_stat_snapshot']['Row'];

export interface StatsTeam {
  teamId: string;
  name: string;
  wins: number;
  losses: number;
  ties: number;
  winPct: number;
  rank: number | null;
  stats: unknown;
}

export interface MyPlayer {
  playerId: string;
  name: string;
  teamName: string;
}

export type LeagueStatsData =
  | { notFound: true }
  | { blocked: true; league: { name: string } }
  | {
      ok: true;
      slug: string;
      league: { id: string; name: string };
      theme: ReturnType<typeof mergeWithThemeDefaults>;
      season: string;
      seasons: string[];
      rankingEnabled: boolean;
      standingsRankEnabled: boolean;
      mins: { paMin: number; ipOutsMin: number };
      players: StatsPlayer[];
      ranks: { batting: RankTable; pitching: RankTable } | null;
      teams: StatsTeam[];
      myPlayers: MyPlayer[];
      /** Coach view: the active team, tinted on the Teams tab. Null for public and player/parent viewers. */
      ourTeamId: string | null;
    };

export interface AssembleInput {
  slug: string;
  league: { id: string; name: string; level: string | null; home_theme: unknown; leader_config: unknown };
  season: string;
  seasons: string[];
  isAuthed: boolean;
  standings: StandingRow[];
  playerSnap: PlayerSnapshotRow[];
  teamSnap: TeamSnapshotRow[];
  myPlayerIds: Set<string>;
  activeTeam: ActiveTeamRef | null;
}

/** The viewer's own players first, then their children's; deduped; only ids in this league's snapshot. */
export function resolveMyPlayerIds(
  ownPlayerIds: string[],
  childPlayerIds: string[],
  snapshotPlayerIds: Set<string>,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of [...ownPlayerIds, ...childPlayerIds]) {
    if (!snapshotPlayerIds.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * Pure assembly of the league stats payload. Everything returned is serialized to
 * the browser, so opted-out rows are dropped for public viewers BEFORE any ranking
 * or name/card derivation — nothing downstream can see them.
 */
export function assembleLeagueStats(input: AssembleInput): Extract<LeagueStatsData, { ok: true }> {
  const { slug, league, season, seasons, isAuthed, standings, playerSnap, teamSnap, myPlayerIds, activeTeam } = input;

  const theme = mergeWithThemeDefaults(league.home_theme);
  const sections = enabledSections(theme);
  const rankingEnabled = sections.has('leaders');
  const standingsRankEnabled = sections.has('standings');

  const platformStandings = standings.filter((r): r is StandingRow & { team_id: string } => Boolean(r.team_id));
  const { paMin, ipOutsMin } = qualifierMinsFor(platformStandings, league.leader_config, league.level);
  const mins = { paMin, ipOutsMin };

  const visible = playerSnap.filter((r) => isAuthed || !r.public_opt_out);
  const markOurTeam = isAuthed && myPlayerIds.size === 0 && !!activeTeam;
  const nameOf = (r: PlayerSnapshotRow) =>
    isAuthed
      ? memberDisplayName({ firstName: r.first_name, lastName: r.last_name })
      : publicDisplayName({ firstName: r.first_name, lastName: r.last_name });

  const players: StatsPlayer[] = visible.map((r) => {
    const mine = myPlayerIds.has(r.player_id);
    return {
      playerId: r.player_id,
      name: nameOf(r),
      teamId: r.team_id,
      teamName: r.team_name,
      pa: r.plate_appearances,
      ipOuts: r.innings_pitched_outs,
      stats: r.stats,
      mine,
      ourTeam: !mine && markOurTeam && r.team_id === activeTeam!.id,
    };
  });

  const ranks = rankingEnabled
    ? {
        batting: computeRankTable(players, BATTING_COLUMNS, 'batting', mins),
        pitching: computeRankTable(players, PITCHING_COLUMNS, 'pitching', mins),
      }
    : null;

  const teamStatsById = new Map(teamSnap.map((t) => [t.team_id, t.stats]));
  const teams: StatsTeam[] = [...platformStandings]
    .sort(compareStandings)
    .map((s) => ({
      teamId: s.team_id,
      name: s.team_name,
      wins: s.wins,
      losses: s.losses,
      ties: s.ties,
      winPct: s.win_pct,
      rank: standingsRankEnabled ? computeTeamRank(standings, s.team_id).rank : null,
      stats: teamStatsById.get(s.team_id) ?? {},
    }));

  const byId = new Map(players.map((p) => [p.playerId, p]));
  const myPlayers: MyPlayer[] = [];
  for (const id of myPlayerIds) {
    const p = byId.get(id);
    if (p) myPlayers.push({ playerId: p.playerId, name: p.name, teamName: p.teamName });
  }

  return {
    ok: true,
    slug,
    league: { id: league.id, name: league.name },
    theme,
    season,
    seasons,
    rankingEnabled,
    standingsRankEnabled,
    mins,
    players,
    ranks,
    teams,
    myPlayers,
    ourTeamId: markOurTeam ? activeTeam!.id : null,
  };
}

export async function getLeagueStatsData(
  slug: string,
  viewer: { userId: string | null; activeTeam: ActiveTeamRef | null },
  seasonParam?: string,
): Promise<LeagueStatsData> {
  const db = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const isAuthed = viewer.userId !== null;

  const { data: league, error: leagueErr } = await db
    .from('leagues')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();
  if (leagueErr) {
    console.error(`[league-stats] league lookup failed slug=${slug}: ${leagueErr.message}`);
    throw new Error('Failed to load league. Please try again.');
  }
  if (!league) return { notFound: true };
  if (resolveVisibility(league.visibility, isAuthed) === 'blocked') {
    return { blocked: true, league: { name: league.name } };
  }

  const { data: seasonRows } = await db
    .from('league_standings_snapshot')
    .select('season')
    .eq('league_id', league.id);
  const { season, seasons } = resolveSeason(seasonRows ?? [], league.current_season, seasonParam);

  const [
    { data: standings, error: standingsErr },
    { data: playerSnap, error: playerErr },
    { data: teamSnap, error: teamErr },
  ] = await Promise.all([
    db.from('league_standings_snapshot').select('*').eq('league_id', league.id).eq('season', season),
    db.from('league_player_stat_snapshot').select('*').eq('league_id', league.id).eq('season', season),
    db.from('league_team_stat_snapshot').select('*').eq('league_id', league.id).eq('season', season),
  ]);
  const snapErr = standingsErr || playerErr || teamErr;
  if (snapErr) {
    console.error(`[league-stats] snapshot read failed league=${league.id} season=${season}: ${snapErr.message}`);
    throw new Error('Failed to load league data. Please try again.');
  }

  const snapshotPlayerIds = new Set((playerSnap ?? []).map((r) => r.player_id));
  let myPlayerIds: string[] = [];
  if (viewer.userId) {
    const [{ data: own, error: ownErr }, { data: children, error: childErr }] = await Promise.all([
      db.from('players').select('id').eq('user_id', viewer.userId),
      db.from('parent_player_links').select('player_id').eq('parent_user_id', viewer.userId),
    ]);
    // Secondary: degrade to "no card" rather than failing the page.
    if (ownErr || childErr) {
      console.error(
        `[league-stats] viewer player lookup failed league=${league.id}: ${(ownErr ?? childErr)!.message}`,
      );
    }
    myPlayerIds = resolveMyPlayerIds(
      (ownErr ? [] : own ?? []).map((r) => r.id),
      (childErr ? [] : children ?? []).map((r) => r.player_id),
      snapshotPlayerIds,
    );
  }

  return assembleLeagueStats({
    slug,
    league,
    season,
    seasons,
    isAuthed,
    standings: standings ?? [],
    playerSnap: playerSnap ?? [],
    teamSnap: teamSnap ?? [],
    myPlayerIds: new Set(myPlayerIds),
    activeTeam: isAuthed ? viewer.activeTeam : null,
  });
}
