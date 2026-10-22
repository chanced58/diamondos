import type { SupabaseClient } from '@supabase/supabase-js';
import {
  addOpponentTeamPlayerInputSchema,
  createOpponentTeamInputSchema,
  opponentTeamIdInputSchema,
  opponentTeamsInputSchema,
  removeOpponentTeamPlayerInputSchema,
  updateOpponentTeamInputSchema,
  updateOpponentTeamPlayerInputSchema,
  type OpponentTeamDetailResponse,
  type OpponentTeamSummary,
  type OpponentTeamsResponse,
} from '@baseball/shared';
import { invalidInput, serviceError, serviceOk, type ServiceResult } from '../result';
import { resolveGameViewer } from '../games/authorize';

/**
 * A team's own opponent teams and their rosters, outside any one game (the web
 * /games/opponents pages). Coaches of the owning team only — platform admins
 * included, as everywhere `resolveGameViewer` decides. Every write is scoped to
 * a team the coach's team owns, so an id from another team matches nothing.
 * Roster writes set updated_at themselves (no touch trigger): phones pull
 * opponent players by it.
 */

type OwnedOpponentTeam = OpponentTeamSummary & { teamId: string };

/** Games that count as played against an opponent: a scheduled one has no plays to read. */
export const PLAYED_GAME_STATUSES = ['completed', 'in_progress'];

async function authorizeTeamCoach(db: SupabaseClient, actorUserId: string, teamId: string): Promise<ServiceResult<null>> {
  const viewer = await resolveGameViewer(db, actorUserId, teamId);
  if (!viewer) return serviceError('not_found', 'Team not found.');
  if (!viewer.isCoach) return serviceError('forbidden', 'Only coaches can manage opponent teams.');
  return serviceOk(null);
}

/** The opponent team, if the actor coaches the team that owns it. League-owned ones aren't a team's to edit. */
export async function authorizeOpponentTeam(
  db: SupabaseClient,
  actorUserId: string,
  opponentTeamId: string,
): Promise<ServiceResult<OwnedOpponentTeam>> {
  const { data: row, error } = await db
    .from('opponent_teams')
    .select('id, team_id, name, abbreviation, city, state_code')
    .eq('id', opponentTeamId)
    .maybeSingle();
  if (error) return writeFailed('authorizeOpponentTeam', opponentTeamId, actorUserId, error);
  if (!row || !row.team_id) return serviceError('not_found', 'Opponent team not found.');

  const coach = await authorizeTeamCoach(db, actorUserId, row.team_id as string);
  // A non-member learns nothing about the team's opponents.
  if (!coach.ok) return coach.code === 'not_found' ? serviceError('not_found', 'Opponent team not found.') : coach;
  return serviceOk({ ...toSummary(row), teamId: row.team_id as string });
}

export async function listOpponentTeams(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<OpponentTeamsResponse>> {
  const parsed = opponentTeamsInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { teamId } = parsed.data;

  const coach = await authorizeTeamCoach(db, actorUserId, teamId);
  if (!coach.ok) return coach;

  const { data: teams, error } = await db
    .from('opponent_teams')
    .select('id, name, abbreviation, city, state_code')
    .eq('team_id', teamId)
    .order('name');
  if (error) return writeFailed('listOpponentTeams', teamId, actorUserId, error);

  const ids = (teams ?? []).map((t) => t.id as string);
  const counts = new Map<string, number>();
  if (ids.length > 0) {
    const { data: players, error: playersError } = await db
      .from('opponent_players')
      .select('opponent_team_id')
      .in('opponent_team_id', ids)
      .eq('is_active', true);
    if (playersError) return writeFailed('listOpponentTeams', teamId, actorUserId, playersError);
    for (const p of players ?? []) counts.set(p.opponent_team_id, (counts.get(p.opponent_team_id) ?? 0) + 1);
  }

  return serviceOk({
    teamId,
    opponentTeams: (teams ?? []).map((t) => ({ ...toSummary(t), playerCount: counts.get(t.id as string) ?? 0 })),
  });
}

export async function loadOpponentTeam(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<OpponentTeamDetailResponse>> {
  const parsed = opponentTeamIdInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { opponentTeamId } = parsed.data;

  const auth = await authorizeOpponentTeam(db, actorUserId, opponentTeamId);
  if (!auth.ok) return auth;
  const { teamId, ...team } = auth.data;

  const [playersResult, gamesResult] = await Promise.all([
    db
      .from('opponent_players')
      .select('id, first_name, last_name, jersey_number, primary_position, bats, throws')
      .eq('opponent_team_id', opponentTeamId)
      .eq('is_active', true)
      .order('jersey_number', { ascending: true, nullsFirst: false }),
    db
      .from('games')
      .select('id', { count: 'exact', head: true })
      .eq('team_id', teamId)
      .eq('opponent_team_id', opponentTeamId)
      .in('status', PLAYED_GAME_STATUSES),
  ]);
  if (playersResult.error) return writeFailed('loadOpponentTeam', opponentTeamId, actorUserId, playersResult.error);
  if (gamesResult.error) return writeFailed('loadOpponentTeam', opponentTeamId, actorUserId, gamesResult.error);

  return serviceOk({
    team,
    players: (playersResult.data ?? []).map((p) => ({
      id: p.id as string,
      firstName: p.first_name as string,
      lastName: p.last_name as string,
      jerseyNumber: (p.jersey_number as string | null) ?? null,
      primaryPosition: (p.primary_position as string | null) ?? null,
      bats: (p.bats as string | null) ?? null,
      throws: (p.throws as string | null) ?? null,
    })),
    priorGames: gamesResult.count ?? 0,
  });
}

export async function createOpponentTeam(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<{ opponentTeamId: string }>> {
  const parsed = createOpponentTeamInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { teamId, name, abbreviation, city, stateCode } = parsed.data;

  const coach = await authorizeTeamCoach(db, actorUserId, teamId);
  if (!coach.ok) return coach;

  const { data, error } = await db
    .from('opponent_teams')
    .insert({ team_id: teamId, name, abbreviation, city, state_code: stateCode, created_by: actorUserId })
    .select('id')
    .single();
  if (error || !data) return writeFailed('createOpponentTeam', teamId, actorUserId, error ?? { message: 'no row returned' });

  return serviceOk({ opponentTeamId: data.id as string });
}

export async function updateOpponentTeam(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<{ opponentTeamId: string }>> {
  const parsed = updateOpponentTeamInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { opponentTeamId, name, abbreviation, city, stateCode } = parsed.data;

  const auth = await authorizeOpponentTeam(db, actorUserId, opponentTeamId);
  if (!auth.ok) return auth;

  const { error } = await db
    .from('opponent_teams')
    .update({ name, abbreviation, city, state_code: stateCode, updated_at: new Date().toISOString() })
    .eq('id', opponentTeamId)
    .eq('team_id', auth.data.teamId);
  if (error) return writeFailed('updateOpponentTeam', opponentTeamId, actorUserId, error);

  return serviceOk({ opponentTeamId });
}

export async function addOpponentTeamPlayer(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<{ playerId: string }>> {
  const parsed = addOpponentTeamPlayerInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { opponentTeamId, firstName, lastName, jerseyNumber, primaryPosition, bats, throws } = parsed.data;

  const auth = await authorizeOpponentTeam(db, actorUserId, opponentTeamId);
  if (!auth.ok) return auth;

  const { data, error } = await db
    .from('opponent_players')
    .insert({
      opponent_team_id: opponentTeamId,
      first_name: firstName,
      last_name: lastName,
      jersey_number: jerseyNumber,
      primary_position: primaryPosition,
      bats,
      throws,
    })
    .select('id')
    .single();
  if (error || !data) return writeFailed('addOpponentTeamPlayer', opponentTeamId, actorUserId, error ?? { message: 'no row returned' });

  return serviceOk({ playerId: data.id as string });
}

export async function updateOpponentTeamPlayer(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<{ playerId: string }>> {
  const parsed = updateOpponentTeamPlayerInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { opponentTeamId, playerId, firstName, lastName, jerseyNumber, primaryPosition, bats, throws } = parsed.data;

  const auth = await authorizeOpponentTeam(db, actorUserId, opponentTeamId);
  if (!auth.ok) return auth;

  const { data, error } = await db
    .from('opponent_players')
    .update({
      first_name: firstName,
      last_name: lastName,
      jersey_number: jerseyNumber,
      primary_position: primaryPosition,
      bats,
      throws,
      updated_at: new Date().toISOString(),
    })
    .eq('id', playerId)
    .eq('opponent_team_id', opponentTeamId)
    .select('id');
  if (error) return writeFailed('updateOpponentTeamPlayer', opponentTeamId, actorUserId, error);
  if (!data || data.length === 0) return serviceError('not_found', 'Player not found on this opponent team.');

  return serviceOk({ playerId });
}

/** Soft delete: the player leaves the roster but keeps any recorded stats. */
export async function removeOpponentTeamPlayer(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<{ playerId: string }>> {
  const parsed = removeOpponentTeamPlayerInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { opponentTeamId, playerId } = parsed.data;

  const auth = await authorizeOpponentTeam(db, actorUserId, opponentTeamId);
  if (!auth.ok) return auth;

  const { data, error } = await db
    .from('opponent_players')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', playerId)
    .eq('opponent_team_id', opponentTeamId)
    .select('id');
  if (error) return writeFailed('removeOpponentTeamPlayer', opponentTeamId, actorUserId, error);
  if (!data || data.length === 0) return serviceError('not_found', 'Player not found on this opponent team.');

  return serviceOk({ playerId });
}

function toSummary(row: Record<string, unknown>): OpponentTeamSummary {
  return {
    id: row.id as string,
    name: row.name as string,
    abbreviation: (row.abbreviation as string | null) ?? null,
    city: (row.city as string | null) ?? null,
    stateCode: (row.state_code as string | null) ?? null,
  };
}

function writeFailed<T = never>(
  service: string,
  id: string,
  actorUserId: string,
  error: { message?: string },
): ServiceResult<T> {
  console.error(`[${service}] id=${id} actor=${actorUserId} failed:`, error);
  return serviceError('failed', 'Something went wrong. Please try again.');
}
