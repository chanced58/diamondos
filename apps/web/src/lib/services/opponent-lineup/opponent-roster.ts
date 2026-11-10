import type { SupabaseClient } from '@supabase/supabase-js';
import {
  addOpponentPlayerInputSchema,
  removeOpponentPlayerInputSchema,
  updateOpponentPlayerInputSchema,
} from '@baseball/shared';
import { invalidInput, serviceError, serviceOk, type ServiceResult } from '../result';
import { authorizeOpponentLineupEdit, isLeagueRosterRecord, writeFailed, type OpponentLineupGame } from './context';

/**
 * Roster edits for the game's opponent team. Every write is scoped to the
 * team linked to the game, so a player id from another team matches nothing.
 * Writes set updated_at themselves (the table has no touch trigger) because
 * phones pull opponent players by it.
 *
 * A league roster record (the opponent of every league game) is the league's
 * mirror of a real team's roster: from a game, a scorer only adds unknown
 * players (placeholders) to it, every add on a league game is one, and only
 * this league game's unmatched placeholders may be edited or removed.
 * Matching and fill-ins go through `resolvePlaceholder`.
 */

const ROSTER_RECORD_REFUSAL = "This team's roster comes from the league; only this game's unknown players can be changed here.";

type GameWithTeam = OpponentLineupGame & { opponentTeamId: string; isRosterRecord: boolean };

async function authorizeWithTeam(
  db: SupabaseClient,
  actorUserId: string,
  gameId: string,
): Promise<ServiceResult<GameWithTeam>> {
  const auth = await authorizeOpponentLineupEdit(db, actorUserId, gameId);
  if (!auth.ok) return auth;
  const { opponentTeamId } = auth.data;
  if (!opponentTeamId) return serviceError('conflict', 'Name the opponent team first.');
  const rosterRecord = await isLeagueRosterRecord(db, opponentTeamId);
  if (!rosterRecord.ok) return rosterRecord;
  return serviceOk({ ...auth.data, opponentTeamId, isRosterRecord: rosterRecord.data });
}

/**
 * On a league roster record, only an unmatched placeholder of this game's
 * league game may be changed; elsewhere any player on the team may.
 */
async function guardRosterRecordPlayer(
  db: SupabaseClient,
  game: GameWithTeam,
  playerId: string,
): Promise<ServiceResult<null>> {
  if (!game.isRosterRecord) return serviceOk(null);
  const { data, error } = await db
    .from('opponent_players')
    .select('placeholder_game_id, linked_player_id, is_fill_in')
    .eq('id', playerId)
    .eq('opponent_team_id', game.opponentTeamId)
    .maybeSingle();
  if (error) {
    console.error(`[opponent-roster] game=${game.gameId} player=${playerId} read failed:`, error);
    return serviceError('failed', 'Failed to load the player.');
  }
  if (!data) return serviceError('not_found', 'Player not found on this opponent team.');
  const player = data as { placeholder_game_id: string | null; linked_player_id: string | null; is_fill_in: boolean };
  const ownPlaceholder =
    game.leagueGameId !== null &&
    player.placeholder_game_id === game.leagueGameId &&
    !player.linked_player_id &&
    !player.is_fill_in;
  return ownPlaceholder ? serviceOk(null) : serviceError('conflict', ROSTER_RECORD_REFUSAL);
}

export async function addOpponentPlayer(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<{ playerId: string }>> {
  const parsed = addOpponentPlayerInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { gameId, firstName, lastName, jerseyNumber, primaryPosition, placeholder } = parsed.data;

  const auth = await authorizeWithTeam(db, actorUserId, gameId);
  if (!auth.ok) return auth;

  // Every player added in a league game is a placeholder of it, whether or
  // not the caller asked, so it can be matched once the game is over and never
  // joins the roster the league mirrors from the real team.
  const placeholderGameId = auth.data.leagueGameId;
  if (placeholder && !placeholderGameId) {
    return serviceError('invalid', 'Unknown players can only be added in league games.');
  }
  if (!placeholderGameId && auth.data.isRosterRecord) return serviceError('conflict', ROSTER_RECORD_REFUSAL);

  const { data, error } = await db
    .from('opponent_players')
    .insert({
      ...(placeholderGameId ? { placeholder_game_id: placeholderGameId } : {}),
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
  const guard = await guardRosterRecordPlayer(db, auth.data, playerId);
  if (!guard.ok) return guard;

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
  const guard = await guardRosterRecordPlayer(db, auth.data, playerId);
  if (!guard.ok) return guard;

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
