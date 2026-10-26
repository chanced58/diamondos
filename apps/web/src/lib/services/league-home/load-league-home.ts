import type { SupabaseClient } from '@supabase/supabase-js';
import {
  LEAGUE_HOME_SECTIONS,
  leagueHomeInputSchema,
  type LeagueHomeResponse,
  type LeagueHomeStandingRow,
  type LeagueLeaderBoard,
} from '@baseball/shared';
import { getLeagueHomeData, type ActiveTeamRef, type LeaderBoardResult, type StandingRow } from '@/lib/league-home/load';
import { formatStat } from '@/lib/league-home/format-stat';
import { teamIdByName } from '@/lib/league-home/team-load';
import { invalidInput, serviceError, serviceOk, type ServiceResult } from '../result';
import { resolveGameViewer } from '../games/authorize';

/**
 * The league home (the web /l/:slug page) for the mobile app: the web page's
 * loader, `getLeagueHomeData`, as a signed-in viewer sees it, in a wire shape
 * with values formatted for display. The viewer's active team is marked when
 * they are on it.
 */

type HomeSection = (typeof LEAGUE_HOME_SECTIONS)[number];
const HOME_SECTIONS = new Set<string>(LEAGUE_HOME_SECTIONS);

/** The league home for a signed-in viewer. */
export async function loadLeagueHome(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<LeagueHomeResponse>> {
  const parsed = leagueHomeInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { slug, season, teamId } = parsed.data;

  try {
    const activeTeam = teamId ? await ownTeamRef(db, actorUserId, teamId) : null;
    const data = await getLeagueHomeData(slug, true, season, activeTeam);
    if ('notFound' in data || 'blocked' in data) return serviceError('not_found', 'League not found.');

    const enabled = data.theme.sections.filter((s) => s.enabled).map((s) => s.id as string);
    // Custom boards appear under Special only when the league shows them (as on the web).
    const special = [...data.defaultBoards.special, ...(enabled.includes('customLeaders') ? data.customBoards : [])];
    const teamIds = teamIdByName(data.standings);

    return serviceOk({
      slug,
      league: { id: data.league.id, name: data.league.name, logoUrl: data.league.logoUrl },
      sections: enabled.filter((id): id is HomeSection => HOME_SECTIONS.has(id)),
      season: data.season,
      seasons: data.seasons,
      counters: data.counters,
      updatedAt: data.updatedAt,
      standings: data.standings.map(toStandingRow),
      divisions: data.divisions.map((d) => ({ id: d.id, name: d.name, rows: d.rows.map(toStandingRow) })),
      leaders: {
        batting: data.defaultBoards.batting.map(toBoard),
        pitching: data.defaultBoards.pitching.map(toBoard),
        team: data.defaultBoards.team.map(toBoard),
        special: special.map(toBoard),
      },
      spotlights: data.spotlights.map((s) => {
        const isPlayer = s.type === 'player_of_week';
        return {
          kind: isPlayer ? ('player' as const) : ('team' as const),
          subjectName: s.subject_name,
          // A hot team carries its own id; a player's team resolves by name, as on the web.
          subjectTeamId: isPlayer ? null : s.subject_id,
          teamName: s.team_name,
          teamId: s.team_name ? teamIds.get(s.team_name.trim().toLowerCase()) ?? null : null,
          blurb: s.blurb,
        };
      }),
      recent: data.recent.map((g) => ({
        id: g.id,
        teamName: g.team,
        teamId: g.team_id,
        opponent: g.opponent,
        ourScore: g.ourScore,
        theirScore: g.theirScore,
        result: g.result,
      })),
      upcoming: data.upcoming,
    });
  } catch (error) {
    console.error(`[loadLeagueHome] slug=${slug} actor=${actorUserId} failed:`, error);
    return serviceError('failed', 'Something went wrong. Please try again.');
  }
}

/** The viewer's team, to mark its rows — only when they are actually on it. */
async function ownTeamRef(db: SupabaseClient, actorUserId: string, teamId: string): Promise<ActiveTeamRef | null> {
  const viewer = await resolveGameViewer(db, actorUserId, teamId);
  if (!viewer) return null;
  const { data, error } = await db.from('teams').select('name').eq('id', teamId).maybeSingle();
  if (error) throw error;
  return data ? { id: teamId, name: data.name as string } : null;
}

/** A standings snapshot row on the wire. */
function toStandingRow(row: StandingRow): LeagueHomeStandingRow {
  return {
    teamId: row.team_id,
    name: row.team_name,
    wins: row.wins,
    losses: row.losses,
    ties: row.ties,
    winPct: row.win_pct,
    runsFor: row.runs_for,
    runsAgainst: row.runs_against,
  };
}

/** A built leaderboard on the wire, each value formatted as the web board shows it. */
function toBoard(board: LeaderBoardResult): LeagueLeaderBoard {
  return {
    key: board.def.key,
    label: board.label,
    rows: board.rows.map((r) => ({
      id: r.id,
      rank: r.rank,
      name: r.name,
      teamName: board.def.subject === 'team' ? null : r.teamName ?? null,
      teamId: r.teamId ?? null,
      display: formatStat(r.value, board.def.format),
      ours: r.ours,
    })),
  };
}
