import type { SupabaseClient } from '@supabase/supabase-js';
import { createLeagueManagedTeamInputSchema, setLeagueSchedulesGamesInputSchema } from '@baseball/shared';
import { authorizeLeagueStaff } from './authorize';
import { invalidInput, serviceError, serviceOk, type ServiceResult } from '../result';

/**
 * League-managed teams: real `teams` rows with no `team_members`, created by
 * league admins and run by the league until a coach joins. The Task 2 trigger
 * on `league_members` creates the team's roster record. Also the per-league
 * "league schedules games" switch.
 */

const ADMIN_ONLY = 'Only league admins can change this.';
const DEFAULT_LEVEL = 'high_school';

function failed<T>(action: string, leagueId: string, actorUserId: string, error: unknown): ServiceResult<T> {
  console.error(`[league-managed-teams] ${action} failed league=${leagueId} actor=${actorUserId}:`, error);
  return serviceError('failed', 'Something went wrong. Please try again.');
}

export async function createLeagueManagedTeam(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<{ teamId: string }>> {
  const parsed = createLeagueManagedTeamInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { leagueId, name, divisionId } = parsed.data;

  const access = await authorizeLeagueStaff(db, actorUserId, leagueId, { requireAdmin: true, forbiddenMessage: ADMIN_ONLY });
  if (!access.ok) return access;

  const { data: league, error: leagueError } = await db.from('leagues').select('level').eq('id', leagueId).maybeSingle();
  if (leagueError) return failed('createLeagueManagedTeam', leagueId, actorUserId, leagueError);
  const level = (league as { level: string | null } | null)?.level ?? DEFAULT_LEVEL;

  const { data: team, error: teamError } = await db
    .from('teams')
    .insert({ name, created_by: actorUserId, level })
    .select('id')
    .single();
  if (teamError || !team) return failed('createLeagueManagedTeam', leagueId, actorUserId, teamError);
  const teamId = (team as { id: string }).id;

  const { error: memberError } = await db
    .from('league_members')
    .insert({ league_id: leagueId, team_id: teamId, division_id: divisionId ?? null, is_active: true });
  if (memberError) {
    const { error: cleanupError } = await db.from('teams').delete().eq('id', teamId);
    if (cleanupError) console.error(`[league-managed-teams] cleanup of team=${teamId} failed:`, cleanupError);
    if ((memberError as { code?: string }).code === '23505') {
      return serviceError('conflict', 'That team is already in the league.');
    }
    return failed('createLeagueManagedTeam', leagueId, actorUserId, memberError);
  }
  return serviceOk({ teamId });
}

export async function setLeagueSchedulesGames(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<{ schedulesGames: boolean }>> {
  const parsed = setLeagueSchedulesGamesInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { leagueId, schedulesGames } = parsed.data;

  const access = await authorizeLeagueStaff(db, actorUserId, leagueId, { requireAdmin: true, forbiddenMessage: ADMIN_ONLY });
  if (!access.ok) return access;

  const { error } = await db.from('leagues').update({ schedules_games: schedulesGames }).eq('id', leagueId);
  if (error) return failed('setLeagueSchedulesGames', leagueId, actorUserId, error);
  return serviceOk({ schedulesGames });
}
