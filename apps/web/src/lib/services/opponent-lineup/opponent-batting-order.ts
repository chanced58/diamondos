import type { SupabaseClient } from '@supabase/supabase-js';
import { gameIdInputSchema, PlayerPosition, saveOpponentLineupInputSchema } from '@baseball/shared';
import { invalidInput, serviceError, serviceOk, type ServiceResult } from '../result';
import { authorizeOpponentLineupEdit, loadMaxBatters, touchGame, writeFailed } from './context';

interface LineupRow {
  opponent_player_id: string;
  batting_order: number | null;
  starting_position: string | null;
  is_starter: boolean;
}

/**
 * Saves the opponent's whole batting order for a game, replacing what it had.
 * Batters hold slots 1..maxBatters, each once. A benched player is dropped —
 * except a benched pitcher, kept so the scorer can identify the starting
 * pitcher. Every player must be on the game's opponent team.
 */
export async function saveOpponentLineup(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<{ gameId: string }>> {
  const parsed = saveOpponentLineupInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { gameId, entries } = parsed.data;

  const auth = await authorizeOpponentLineupEdit(db, actorUserId, gameId);
  if (!auth.ok) return auth;
  const game = auth.data;

  const maxBatters = await loadMaxBatters(db, game);
  if (!maxBatters.ok) return maxBatters;

  const kept = entries.filter(
    (entry) => entry.battingOrder !== null || entry.startingPosition === PlayerPosition.PITCHER,
  );
  if (kept.some((entry) => entry.battingOrder !== null && entry.battingOrder > maxBatters.data)) {
    return serviceError('invalid', `The order holds at most ${maxBatters.data} batters.`);
  }
  const orders = kept.flatMap((entry) => (entry.battingOrder === null ? [] : [entry.battingOrder]));
  if (orders.length !== new Set(orders).size) {
    return serviceError('invalid', 'Duplicate batting order positions. Each spot can only be assigned once.');
  }
  const playerIds = kept.map((entry) => entry.opponentPlayerId);
  if (playerIds.length !== new Set(playerIds).size) {
    return serviceError('invalid', 'A player appears in the order twice.');
  }

  if (playerIds.length > 0) {
    if (!game.opponentTeamId) return serviceError('conflict', 'Name the opponent team first.');
    const { data: onTeam, error } = await db
      .from('opponent_players')
      .select('id')
      .eq('opponent_team_id', game.opponentTeamId)
      .in('id', playerIds);
    if (error) return writeFailed('saveOpponentLineup', gameId, actorUserId, error);
    if ((onTeam ?? []).length !== playerIds.length) {
      return serviceError('invalid', 'A player in this order is not on the opponent roster.');
    }
  }

  const replaced = await replaceOpponentLineup(
    db,
    gameId,
    kept.map((entry) => ({
      opponent_player_id: entry.opponentPlayerId,
      batting_order: entry.battingOrder,
      starting_position: entry.startingPosition,
      is_starter: true,
    })),
  );
  if (!replaced.ok) return writeFailed('saveOpponentLineup', gameId, actorUserId, replaced.error);

  await touchGame(db, gameId);
  return serviceOk({ gameId });
}

/**
 * Seeds the game's order from the opponent's active roster: everyone on the
 * bench at their usual position, for the coach to number.
 */
export async function autoFillOpponentLineup(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<{ gameId: string }>> {
  const parsed = gameIdInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { gameId } = parsed.data;

  const auth = await authorizeOpponentLineupEdit(db, actorUserId, gameId);
  if (!auth.ok) return auth;
  const { opponentTeamId } = auth.data;
  if (!opponentTeamId) return serviceError('conflict', 'Name the opponent team first.');

  const { data: players, error } = await db
    .from('opponent_players')
    .select('id, primary_position')
    .eq('opponent_team_id', opponentTeamId)
    .eq('is_active', true)
    .order('created_at');
  if (error) return writeFailed('autoFillOpponentLineup', gameId, actorUserId, error);
  if (!players || players.length === 0) return serviceError('conflict', 'No active players in the roster.');

  const replaced = await replaceOpponentLineup(
    db,
    gameId,
    players.map((player) => ({
      opponent_player_id: player.id as string,
      batting_order: null,
      starting_position: (player.primary_position as string | null) ?? null,
      is_starter: true,
    })),
  );
  if (!replaced.ok) return writeFailed('autoFillOpponentLineup', gameId, actorUserId, replaced.error);

  await touchGame(db, gameId);
  return serviceOk({ gameId });
}

/**
 * Delete-then-insert (unique(game_id, batting_order) is not deferrable, so
 * an in-place reorder would collide). If the insert fails, the previous rows
 * are put back so a failed save never leaves the game without an order.
 */
async function replaceOpponentLineup(
  db: SupabaseClient,
  gameId: string,
  rows: LineupRow[],
): Promise<{ ok: true } | { ok: false; error: { message?: string } }> {
  const { data: previous, error: readError } = await db
    .from('opponent_game_lineups')
    .select('opponent_player_id, batting_order, starting_position, is_starter')
    .eq('game_id', gameId);
  if (readError) return { ok: false, error: readError };

  const { error: deleteError } = await db.from('opponent_game_lineups').delete().eq('game_id', gameId);
  if (deleteError) return { ok: false, error: deleteError };
  if (rows.length === 0) return { ok: true };

  const { error: insertError } = await db
    .from('opponent_game_lineups')
    .insert(rows.map((row) => ({ game_id: gameId, ...row })));
  if (!insertError) return { ok: true };

  const restore = ((previous ?? []) as LineupRow[]).map((row) => ({ game_id: gameId, ...row }));
  if (restore.length > 0) {
    const { error: restoreError } = await db.from('opponent_game_lineups').insert(restore);
    if (restoreError) console.error(`[opponent-lineup] game=${gameId} restore after failed save failed:`, restoreError);
  }
  return { ok: false, error: insertError };
}
