import { createClient } from '@supabase/supabase-js';
import {
  buildLeaderboard,
  getStatDef,
  publicDisplayName,
  memberDisplayName,
  mergeWithThemeDefaults,
  leagueLeaderConfigSchema,
  type LeaderRow,
  type RankedLeaderRow,
  type StatDef,
} from '@baseball/shared';

const DEFAULT_PA_PER_GAME = 2.0;
const DEFAULT_IP_PER_GAME = 1.0;

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
      value: Number(r.stats?.[def.field] ?? 0),
      qualifierValue: def.qualifier === 'ip' ? r.innings_pitched_outs : r.plate_appearances,
    }));
}

const DEFAULT_BATTING = ['avg', 'homeRuns', 'rbi', 'hits', 'runs', 'obp', 'ops'];
const DEFAULT_PITCHING = ['era', 'whip', 'strikeoutsP'];
const DEFAULT_TEAM = ['teamAvg', 'teamEra', 'runsScored', 'runDiff'];

export interface LeaderBoardResult {
  def: StatDef;
  label: string;
  rows: RankedLeaderRow[];
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
      standings: any[];
      defaultBoards: { batting: LeaderBoardResult[]; pitching: LeaderBoardResult[]; team: LeaderBoardResult[] };
      customBoards: LeaderBoardResult[];
      spotlights: any[];
      recent: Array<{ id: string; label: string }>;
      upcoming: Array<{ id: string; label: string }>;
      counters: { teams: number; games: number };
    };

export async function getLeagueHomeData(
  slug: string,
  isAuthed: boolean,
  seasonParam?: string,
): Promise<LeagueHomeData> {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const { data: league } = await db.from('leagues').select('*').eq('slug', slug).maybeSingle();
  if (!league) return { notFound: true };
  if (resolveVisibility(league.visibility, isAuthed) === 'blocked') {
    return { blocked: true, league: { name: league.name } };
  }

  const theme = mergeWithThemeDefaults(league.home_theme);
  const leaderConfig = leagueLeaderConfigSchema.parse(league.leader_config ?? {});

  // Resolve available seasons (distinct snapshot season names) and the active one.
  const { data: seasonRows } = await db
    .from('league_standings_snapshot')
    .select('season')
    .eq('league_id', league.id);
  const seasons = Array.from(new Set((seasonRows ?? []).map((r: { season: string }) => r.season))).sort((a, b) =>
    b.localeCompare(a),
  );
  const season = seasonParam ?? league.current_season ?? seasons[0] ?? '';

  const [{ data: standings }, { data: playerSnap }, { data: teamSnap }, { data: spots }] = await Promise.all([
    db.from('league_standings_snapshot').select('*').eq('league_id', league.id).eq('season', season),
    db.from('league_player_stat_snapshot').select('*').eq('league_id', league.id).eq('season', season),
    db.from('league_team_stat_snapshot').select('*').eq('league_id', league.id).eq('season', season),
    db.from('league_spotlight_snapshot').select('*').eq('league_id', league.id).eq('season', season),
  ]);

  const standingsSorted = (standings ?? []).sort((a: any, b: any) => b.win_pct - a.win_pct);
  const leagueGames = standingsSorted.reduce(
    (max: number, r: any) => Math.max(max, r.wins + r.losses + r.ties),
    0,
  );
  const paMin = (leaderConfig.qualifierOverrides.paPerGame ?? DEFAULT_PA_PER_GAME) * leagueGames;
  const ipOutsMin = (leaderConfig.qualifierOverrides.ipPerGame ?? DEFAULT_IP_PER_GAME) * leagueGames * 3;

  const board = (statKey: string, label?: string, limit = 10): LeaderBoardResult => {
    const def = getStatDef(statKey as any);
    const rows: LeaderRow[] =
      def.subject === 'team'
        ? (teamSnap ?? []).map((t: any) => ({
            id: t.team_id,
            name: t.team_name,
            value: Number(t.stats?.[def.field] ?? 0),
            qualifierValue: 1,
          }))
        : toLeaderRows(playerSnap ?? [], statKey, isAuthed);
    const minQualifier = def.qualifier === 'ip' ? ipOutsMin : def.qualifier === 'pa' ? paMin : 0;
    return { def, label: label ?? def.label, rows: buildLeaderboard(rows, def, { minQualifier, limit }) };
  };

  // Recent results + upcoming for the league's teams.
  const teamIds = standingsSorted.map((r: any) => r.team_id);
  let recent: Array<{ id: string; label: string }> = [];
  let upcoming: Array<{ id: string; label: string }> = [];
  if (teamIds.length) {
    const teamNameById = new Map<string, string>(standingsSorted.map((r: any) => [r.team_id, r.team_name]));
    const [{ data: recentGames }, { data: upcomingGames }] = await Promise.all([
      db
        .from('games')
        .select('id, team_id, opponent_name, home_score, away_score, scheduled_at')
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
    recent = (recentGames ?? []).map((g: any) => ({
      id: g.id,
      label: `${teamNameById.get(g.team_id) ?? 'Team'} ${g.home_score}-${g.away_score} vs ${g.opponent_name}`,
    }));
    upcoming = (upcomingGames ?? []).map((g: any) => ({
      id: g.id,
      label: `${teamNameById.get(g.team_id) ?? 'Team'} vs ${g.opponent_name} — ${new Date(g.scheduled_at).toLocaleDateString()}`,
    }));
  }

  const totalGames = standingsSorted.reduce((s: number, r: any) => s + r.wins + r.losses + r.ties, 0);

  return {
    ok: true,
    league: { id: league.id, name: league.name, logoUrl: league.logo_url, visibility: league.visibility },
    theme,
    season,
    seasons,
    standings: standingsSorted,
    defaultBoards: {
      batting: DEFAULT_BATTING.map((k) => board(k)),
      pitching: DEFAULT_PITCHING.map((k) => board(k)),
      team: DEFAULT_TEAM.map((k) => board(k)),
    },
    customBoards: leaderConfig.custom.map((c) => board(c.statKey, c.label, c.limit)),
    spotlights: spots ?? [],
    recent,
    upcoming,
    counters: { teams: standingsSorted.length, games: Math.floor(totalGames / 2) },
  };
}
