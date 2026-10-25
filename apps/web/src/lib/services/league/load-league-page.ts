import type { SupabaseClient } from '@supabase/supabase-js';
import { leaguePageInputSchema, mergeWithThemeDefaults, type LeaguePageResponse } from '@baseball/shared';
import { getLeagueDivisions, getLeagueForTeam, getLeagueStaff, getLeagueTeams } from '@baseball/database';
import { invalidInput, serviceError, serviceOk, type ServiceResult } from '../result';
import { resolveGameViewer } from '../games/authorize';
import { buildStandings, overallRank, type CompletedGame } from './league-standings';

/**
 * The team's league page (the web /league page and the mobile More › League
 * screen): the league, its counters, standings by division and staff. Read
 * with the service role for any member of the team, as the web page does
 * (league tables are hidden from most users by RLS). A team in no league is
 * not found.
 */

const GAME_COLUMNS = 'id, team_id, opponent_team_id, home_score, away_score, location_type, neutral_home_team, scheduled_at';

type StaffRow = {
  id: string;
  role: 'league_admin' | 'league_manager';
  user_id: string;
  user_profiles: { first_name: string | null; last_name: string | null } | Array<{ first_name: string | null; last_name: string | null }> | null;
};

/** The league page for a member of `teamId`. */
export async function loadLeaguePage(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<LeaguePageResponse>> {
  const parsed = leaguePageInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { teamId } = parsed.data;

  const viewer = await resolveGameViewer(db, actorUserId, teamId);
  if (!viewer) return serviceError('not_found', 'Team not found.');

  try {
    const league = await getLeagueForTeam(db as never, teamId);
    if (!league) return serviceError('not_found', 'This team is not in a league.');

    const [teams, divisions, staff, theme] = await Promise.all([
      getLeagueTeams(db as never, league.id),
      getLeagueDivisions(db as never, league.id),
      getLeagueStaff(db as never, league.id) as Promise<StaffRow[]>,
      db.from('leagues').select('home_theme').eq('id', league.id).maybeSingle(),
    ]);
    if (theme.error) throw theme.error;

    const platformIds = teams.flatMap((t) => (t.team_id ? [t.team_id] : []));
    const opponentIds = teams.flatMap((t) => (t.opponent_team_id ? [t.opponent_team_id] : []));
    const [platformGames, opponentGames] = await Promise.all([
      completedGames(db, 'team_id', platformIds),
      completedGames(db, 'opponent_team_id', opponentIds),
    ]);

    const standings = buildStandings({ teams, divisions, platformGames, opponentGames, activeTeamId: teamId });
    return serviceOk({
      league: { id: league.id, name: league.name, description: league.description, slug: league.slug },
      counters: {
        teams: teams.length,
        divisions: divisions.length,
        gamesPlayed: standings.gamesPlayed,
        yourRank: overallRank(standings.divisions),
      },
      divisions: standings.divisions,
      staff: staff.map((s) => ({ id: s.id, name: staffName(s), role: s.role })),
      isLeagueAdmin: staff.some((s) => s.user_id === actorUserId && s.role === 'league_admin'),
      colorScheme: mergeWithThemeDefaults((theme.data as { home_theme?: unknown } | null)?.home_theme).colorScheme,
    });
  } catch (error) {
    console.error(`[loadLeaguePage] team=${teamId} actor=${actorUserId} failed:`, error);
    return serviceError('failed', 'Something went wrong. Please try again.');
  }
}

/** Completed games whose `column` is one of `ids` (none for an empty list). */
async function completedGames(db: SupabaseClient, column: 'team_id' | 'opponent_team_id', ids: string[]): Promise<CompletedGame[]> {
  if (ids.length === 0) return [];
  const { data, error } = await db.from('games').select(GAME_COLUMNS).in(column, ids).eq('status', 'completed');
  if (error) throw new Error(`completed games by ${column}: ${error.message}`);
  return (data ?? []) as CompletedGame[];
}

/** A staff member's name as the web page shows it. */
function staffName(staff: StaffRow): string {
  const profile = Array.isArray(staff.user_profiles) ? staff.user_profiles[0] : staff.user_profiles;
  if (!profile) return 'Unknown';
  return `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim() || 'Staff';
}
