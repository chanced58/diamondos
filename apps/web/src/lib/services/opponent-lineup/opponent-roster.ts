import type { SupabaseClient } from '@supabase/supabase-js';
import {
  addOpponentPlayerInputSchema,
  removeOpponentPlayerInputSchema,
  updateOpponentPlayerInputSchema,
} from '@baseball/shared';
import { invalidInput, serviceError, serviceOk, type ServiceResult } from '../result';
import { authorizeOpponentLineupEdit, writeFailed, type OpponentLineupGame } from './context';

/**
 * Roster edits for the game's opponent team. Every write is scoped to the
 * team linked to the game, so a player id from another team matches nothing.
 * Writes set updated_at themselves (the table has no touch trigger) because
 * phones pull opponent players by it.
 */

async function authorizeWithTeam(
  db: SupabaseClient,
  actorUserId: string,
  gameId: string,
): Promise<ServiceResult<OpponentLineupGame & { opponentTeamId: string }>> {
  const auth = await authorizeOpponentLineupEdit(db, actorUserId, gameId);
  if (!auth.ok) return auth;
  const { opponentTeamId } = auth.data;
  if (!opponentTeamId) return serviceError('conflict', 'Name the opponent team first.');
  return serviceOk({ ...auth.data, opponentTeamId });
}

export async function addOpponentPlayer(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<{ playerId: string }>> {
  const parsed = addOpponentPlayerInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { gameId, firstName, lastName, jerseyNumber, primaryPosition } = parsed.data;

  const auth = await authorizeWithTeam(db, actorUserId, gameId);
  if (!auth.ok) return auth;

  const { data, error } = await db
    .from('opponent_players')
    .insert({
      opponent_team_id: auth.data.opponentTeamId,
      first_name: firstName,
      last_name: lastName,
      jersey_number: jerseyNumber,
      primary_position: primaryPosition,
    })
    .select('id')
    .single();
  if (error || !data) return writeFailed('addOpponentPlayer', gameId, actorUserId, error ?? { message: 'no row returned' });

  return serviceOk({ playerId: data.id as string });
}

export async function updateOpponentPlayer(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<{ playerId: string }>> {
  const parsed = updateOpponentPlayerInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { gameId, playerId, firstName, lastName, jerseyNumber, primaryPosition } = parsed.data;

  const auth = await authorizeWithTeam(db, actorUserId, gameId);
  if (!auth.ok) return auth;

  const { data, error } = await db
    .from('opponent_players')
    .update({
      first_name: firstName,
      last_name: lastName,
      jersey_number: jerseyNumber,
      primary_position: primaryPosition,
      updated_at: new Date().toISOString(),
    })
    .eq('id', playerId)
    .eq('opponent_team_id', auth.data.opponentTeamId)
    .select('id');
  if (error) return writeFailed('updateOpponentPlayer', gameId, actorUserId, error);
  if (!data || data.length === 0) return serviceError('not_found', 'Player not found on this opponent team.');

  return serviceOk({ playerId });
}

/** Soft delete: the player leaves the roster but keeps any recorded stats. */
export async function removeOpponentPlayer(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<{ playerId: string }>> {
  const parsed = removeOpponentPlayerInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { gameId, playerId } = parsed.data;

  const auth = await authorizeWithTeam(db, actorUserId, gameId);
  if (!auth.ok) return auth;

  const { data, error } = await db
    .from('opponent_players')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', playerId)
    .eq('opponent_team_id', auth.data.opponentTeamId)
    .select('id');
  if (error) return writeFailed('removeOpponentPlayer', gameId, actorUserId, error);
  if (!data || data.length === 0) return serviceError('not_found', 'Player not found on this opponent team.');

  return serviceOk({ playerId });
}
