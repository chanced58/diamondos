import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createSeasonInputSchema,
  isCoachRole,
  seasonFor,
  seasonIdInputSchema,
  teamSeasonsInputSchema,
  type CreateSeasonResponse,
  type SeasonWriteResponse,
  type TeamSeasonsResponse,
} from '@baseball/shared';
import { invalidInput, serviceError, serviceOk, type ServiceResult } from '../result';

/**
 * A team's seasons (the web team admin Seasons page), shared by the web
 * actions and the mobile `/api/m/v1/teams/:teamId/seasons` routes. Platform
 * admins and the team's head coaches, assistants and athletic directors
 * list, create, activate and deactivate them; a team has at most one active
 * season (`seasons_one_active_per_team`).
 */

type SeasonRow = { id: string; name: string; start_date: string; end_date: string | null; is_active: boolean };

function failed<T>(action: string, teamId: string, actorUserId: string, error: unknown): ServiceResult<T> {
  console.error(`[seasons] ${action} failed team=${teamId} actor=${actorUserId}:`, error);
  return serviceError('failed', 'Something went wrong. Please try again.');
}

/** Season managers only; a member who can't manage is refused, anyone else learns nothing. */
async function authorizeSeasonManager(db: SupabaseClient, actorUserId: string, teamId: string): Promise<ServiceResult<null>> {
  const [profileResult, membershipResult] = await Promise.all([
    db.from('user_profiles').select('is_platform_admin').eq('id', actorUserId).maybeSingle(),
    db.from('team_members').select('role').eq('team_id', teamId).eq('user_id', actorUserId).eq('is_active', true).maybeSingle(),
  ]);
  if (profileResult.error || membershipResult.error) {
    return failed('authorize', teamId, actorUserId, profileResult.error ?? membershipResult.error);
  }
  if (profileResult.data?.is_platform_admin === true) return serviceOk(null);
  const role = membershipResult.data?.role as string | undefined;
  if (!role) return serviceError('not_found', 'Team not found.');
  if (!isCoachRole(role)) return serviceError('forbidden', 'Only coaches can manage seasons.');
  return serviceOk(null);
}

/** The team's seasons, newest first. */
export async function loadTeamSeasons(db: SupabaseClient, actorUserId: string, rawInput: unknown): Promise<ServiceResult<TeamSeasonsResponse>> {
  const parsed = teamSeasonsInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { teamId } = parsed.data;

  const authorized = await authorizeSeasonManager(db, actorUserId, teamId);
  if (!authorized.ok) return authorized;

  const { data, error } = await db
    .from('seasons')
    .select('id, name, start_date, end_date, is_active')
    .eq('team_id', teamId)
    .order('start_date', { ascending: false });
  if (error) return failed('loadTeamSeasons', teamId, actorUserId, error);

  return serviceOk({
    seasons: ((data ?? []) as SeasonRow[]).map((row) => ({
      seasonId: row.id,
      name: row.name,
      startDate: row.start_date,
      endDate: row.end_date,
      isActive: row.is_active,
    })),
  });
}

/**
 * Creates a Spring, Summer or Fall season (inactive) unless the team has one
 * by that name, and puts the team's games in its dates that have no season
 * into it.
 */
export async function createTeamSeason(db: SupabaseClient, actorUserId: string, rawInput: unknown): Promise<ServiceResult<CreateSeasonResponse>> {
  const parsed = createSeasonInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { teamId, term, year } = parsed.data;

  const authorized = await authorizeSeasonManager(db, actorUserId, teamId);
  if (!authorized.ok) return authorized;

  const { name, startDate, endDate } = seasonFor(term, year);
  const { data: existing, error: existingError } = await db
    .from('seasons')
    .select('id')
    .eq('team_id', teamId)
    .eq('name', name)
    .maybeSingle();
  if (existingError) return failed('createTeamSeason', teamId, actorUserId, existingError);
  if (existing) return serviceError('conflict', `${name} already exists.`);

  const { data: season, error } = await db
    .from('seasons')
    .insert({ team_id: teamId, name, start_date: startDate, end_date: endDate, is_active: false })
    .select('id')
    .single();
  if (error || !season) return failed('createTeamSeason', teamId, actorUserId, error);
  const seasonId = season.id as string;

  // The season is made either way; games left out can still be given one.
  const { data: attached, error: attachError } = await db
    .from('games')
    .update({ season_id: seasonId })
    .eq('team_id', teamId)
    .is('season_id', null)
    .gte('scheduled_at', `${startDate}T00:00:00`)
    .lte('scheduled_at', `${endDate}T23:59:59`)
    .select('id');
  if (attachError) console.error(`[seasons] attaching games failed team=${teamId} season=${seasonId}:`, attachError);

  return serviceOk({ seasonId, gamesAttached: (attached ?? []).length });
}

/**
 * Makes a season the team's active one, deactivating the one before it (put
 * back if the switch fails, so the team isn't left without one).
 */
export async function setActiveTeamSeason(db: SupabaseClient, actorUserId: string, rawInput: unknown): Promise<ServiceResult<SeasonWriteResponse>> {
  const parsed = seasonIdInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { teamId, seasonId } = parsed.data;

  const authorized = await authorizeSeasonManager(db, actorUserId, teamId);
  if (!authorized.ok) return authorized;

  const { data: season, error: seasonError } = await db
    .from('seasons')
    .select('id, is_active')
    .eq('id', seasonId)
    .eq('team_id', teamId)
    .maybeSingle();
  if (seasonError) return failed('setActiveTeamSeason', teamId, actorUserId, seasonError);
  if (!season) return serviceError('not_found', 'Season not found.');
  if (season.is_active) return serviceOk({ ok: true });

  const { data: previous, error: previousError } = await db
    .from('seasons')
    .update({ is_active: false })
    .eq('team_id', teamId)
    .eq('is_active', true)
    .select('id');
  if (previousError) return failed('setActiveTeamSeason', teamId, actorUserId, previousError);

  const { error } = await db.from('seasons').update({ is_active: true }).eq('id', seasonId).eq('team_id', teamId);
  if (!error) return serviceOk({ ok: true });

  const previousId = (previous ?? [])[0]?.id as string | undefined;
  if (previousId) {
    const { error: restoreError } = await db.from('seasons').update({ is_active: true }).eq('id', previousId).eq('team_id', teamId);
    if (restoreError) console.error(`[seasons] restoring active season failed team=${teamId} season=${previousId}:`, restoreError);
  }
  return failed('setActiveTeamSeason', teamId, actorUserId, error);
}

/** Leaves the team without an active season. */
export async function deactivateTeamSeason(db: SupabaseClient, actorUserId: string, rawInput: unknown): Promise<ServiceResult<SeasonWriteResponse>> {
  const parsed = seasonIdInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { teamId, seasonId } = parsed.data;

  const authorized = await authorizeSeasonManager(db, actorUserId, teamId);
  if (!authorized.ok) return authorized;

  const { data, error } = await db
    .from('seasons')
    .update({ is_active: false })
    .eq('id', seasonId)
    .eq('team_id', teamId)
    .select('id');
  if (error) return failed('deactivateTeamSeason', teamId, actorUserId, error);
  if ((data ?? []).length === 0) return serviceError('not_found', 'Season not found.');
  return serviceOk({ ok: true });
}
