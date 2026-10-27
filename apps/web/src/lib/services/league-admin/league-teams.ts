import type { SupabaseClient } from '@supabase/supabase-js';
import { getLeagueDivisions, getLeagueTeamsAll } from '@baseball/database';
import {
  addLeagueDivisionInputSchema,
  leagueAdminInputSchema,
  leagueDivisionIdInputSchema,
  leagueMembershipInputSchema,
  setLeagueTeamActiveInputSchema,
  setLeagueTeamDivisionInputSchema,
  type LeagueDivisionWriteResponse,
  type LeagueTeamWriteResponse,
  type LeagueTeamsResponse,
} from '@baseball/shared';
import { authorizeLeagueStaff } from './authorize';
import { invalidInput, serviceError, serviceOk, type ServiceResult } from '../result';

/**
 * A league's teams and divisions (the web /league/admin page), shared by its
 * actions and the mobile `/api/m/v1/league-admin/:leagueId/teams|divisions`
 * routes. League staff read and add or remove divisions; league admins move
 * teams between divisions, activate or deactivate them, and remove them from
 * the league, as the RLS policies on `league_divisions` and `league_members`
 * allow. Every write is held to rows of the actor's league.
 */

const TEAMS_ADMIN_ONLY = 'Only league admins can change teams.';
const UNIQUE_VIOLATION = '23505';

function failed<T>(action: string, leagueId: string, actorUserId: string, error: unknown): ServiceResult<T> {
  console.error(`[league-teams] ${action} failed league=${leagueId} actor=${actorUserId}:`, error);
  return serviceError('failed', 'Something went wrong. Please try again.');
}

export async function loadLeagueTeams(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<LeagueTeamsResponse>> {
  const parsed = leagueAdminInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { leagueId } = parsed.data;

  const access = await authorizeLeagueStaff(db, actorUserId, leagueId, { requireAdmin: false });
  if (!access.ok) return access;

  try {
    const [members, divisions] = await Promise.all([getLeagueTeamsAll(db, leagueId), getLeagueDivisions(db, leagueId)]);
    const teams = members
      .map((member) => ({
        membershipId: member.id,
        name: member.teams?.name ?? member.opponent_teams?.name ?? 'Unknown',
        organization: member.teams?.organization ?? null,
        divisionId: member.division_id,
        isOpponentTeam: member.opponent_team_id !== null,
        isActive: member.is_active,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return serviceOk({
      league: access.data.league,
      canEditTeams: access.data.isLeagueAdmin,
      canEditDivisions: true,
      teams,
      divisions: divisions.map((division) => ({ id: division.id, name: division.name })),
    });
  } catch (error) {
    return failed('loadLeagueTeams', leagueId, actorUserId, error);
  }
}

export async function addLeagueDivision(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<LeagueDivisionWriteResponse>> {
  const parsed = addLeagueDivisionInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { leagueId, name } = parsed.data;

  const access = await authorizeLeagueStaff(db, actorUserId, leagueId, { requireAdmin: false });
  if (!access.ok) return access;

  const { data, error } = await db.from('league_divisions').insert({ league_id: leagueId, name }).select('id').single();
  if (error) {
    if ((error as { code?: string }).code === UNIQUE_VIOLATION) return serviceError('conflict', `There is already a division named ${name}.`);
    return failed('addLeagueDivision', leagueId, actorUserId, error);
  }
  return serviceOk({ divisionId: (data as { id: string }).id });
}

/** Removes a division; its teams stay in the league with no division. */
export async function removeLeagueDivision(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<LeagueDivisionWriteResponse>> {
  const parsed = leagueDivisionIdInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { leagueId, divisionId } = parsed.data;

  const access = await authorizeLeagueStaff(db, actorUserId, leagueId, { requireAdmin: false });
  if (!access.ok) return access;

  const { data, error } = await db.from('league_divisions').delete().eq('id', divisionId).eq('league_id', leagueId).select('id');
  if (error) return failed('removeLeagueDivision', leagueId, actorUserId, error);
  if (!data || (data as unknown[]).length === 0) return serviceError('not_found', 'Division not found.');
  return serviceOk({ divisionId });
}

/** Moves a team into one of the league's divisions, or out of every division. */
export async function setLeagueTeamDivision(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<LeagueTeamWriteResponse>> {
  const parsed = setLeagueTeamDivisionInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { leagueId, membershipId, divisionId } = parsed.data;

  const access = await authorizeLeagueStaff(db, actorUserId, leagueId, { requireAdmin: true, forbiddenMessage: TEAMS_ADMIN_ONLY });
  if (!access.ok) return access;

  // Only a division of this league, never another league's.
  if (divisionId) {
    const { data: division, error: divisionError } = await db
      .from('league_divisions')
      .select('id')
      .eq('id', divisionId)
      .eq('league_id', leagueId)
      .maybeSingle();
    if (divisionError) return failed('setLeagueTeamDivision', leagueId, actorUserId, divisionError);
    if (!division) return serviceError('invalid', 'Pick one of the league’s divisions.');
  }

  return updateMembership(db, actorUserId, leagueId, membershipId, { division_id: divisionId }, 'setLeagueTeamDivision');
}

/** Activates or deactivates a team's seat in the league; an inactive team keeps its history. */
export async function setLeagueTeamActive(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<LeagueTeamWriteResponse>> {
  const parsed = setLeagueTeamActiveInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { leagueId, membershipId, isActive } = parsed.data;

  const access = await authorizeLeagueStaff(db, actorUserId, leagueId, { requireAdmin: true, forbiddenMessage: TEAMS_ADMIN_ONLY });
  if (!access.ok) return access;

  return updateMembership(db, actorUserId, leagueId, membershipId, { is_active: isActive }, 'setLeagueTeamActive');
}

/** Removes a team from the league for good. */
export async function removeLeagueTeam(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<LeagueTeamWriteResponse>> {
  const parsed = leagueMembershipInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { leagueId, membershipId } = parsed.data;

  const access = await authorizeLeagueStaff(db, actorUserId, leagueId, { requireAdmin: true, forbiddenMessage: TEAMS_ADMIN_ONLY });
  if (!access.ok) return access;

  const { data, error } = await db.from('league_members').delete().eq('id', membershipId).eq('league_id', leagueId).select('id');
  if (error) return failed('removeLeagueTeam', leagueId, actorUserId, error);
  if (!data || (data as unknown[]).length === 0) return serviceError('not_found', 'Team not found in this league.');
  return serviceOk({ membershipId });
}

/** Updates one of the league's memberships; one from another league matches nothing. */
async function updateMembership(
  db: SupabaseClient,
  actorUserId: string,
  leagueId: string,
  membershipId: string,
  changes: Record<string, unknown>,
  action: string,
): Promise<ServiceResult<LeagueTeamWriteResponse>> {
  const { data, error } = await db.from('league_members').update(changes).eq('id', membershipId).eq('league_id', leagueId).select('id');
  if (error) return failed(action, leagueId, actorUserId, error);
  if (!data || (data as unknown[]).length === 0) return serviceError('not_found', 'Team not found in this league.');
  return serviceOk({ membershipId });
}
