import type { SupabaseClient } from '@supabase/supabase-js';
import { gameIdInputSchema } from '@baseball/shared';
import { invalidInput, serviceError, serviceOk, type ServiceResult } from '../result';
import { authorizeGameCoach } from './authorize';

/**
 * Returns a started or finished game to `scheduled`. game_events is
 * append-only, so the reset is recorded as a `game_reset` event (replay
 * ignores everything before it) rather than by deleting the log.
 */
export async function resetGame(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
  deviceId: string,
): Promise<ServiceResult<{ gameId: string }>> {
  const parsed = gameIdInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { gameId } = parsed.data;

  const auth = await authorizeGameCoach(db, actorUserId, gameId);
  if (!auth.ok) return auth;
  const game = auth.data;

  if (game.status === 'scheduled') return serviceError('conflict', 'Game is already in scheduled state.');

  const now = new Date().toISOString();

  const { data: lastEvent } = await db
    .from('game_events')
    .select('sequence_number')
    .eq('game_id', gameId)
    .order('sequence_number', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error: resetEventError } = await db.from('game_events').insert({
    id: crypto.randomUUID(),
    game_id: gameId,
    sequence_number: (lastEvent?.sequence_number ?? 0) + 1,
    event_type: 'game_reset',
    inning: 1,
    is_top_of_inning: true,
    payload: { resetBy: actorUserId, previousStatus: game.status },
    occurred_at: now,
    created_by: actorUserId,
    device_id: deviceId,
  });
  if (resetEventError) {
    console.error(`[resetGame] game=${gameId} actor=${actorUserId} reset event failed:`, resetEventError);
    return serviceError('failed', `Failed to reset game: ${resetEventError.message}`);
  }

  const { error } = await db
    .from('games')
    .update({
      status:           'scheduled',
      home_score:        0,
      away_score:        0,
      current_inning:    1,
      is_top_of_inning:  true,
      outs:              0,
      started_at:        null,
      completed_at:      null,
      updated_at:        now,
    })
    .eq('id', gameId);
  if (error) {
    console.error(`[resetGame] game=${gameId} actor=${actorUserId} game update failed:`, error);
    return serviceError('failed', `Failed to reset game: ${error.message}`);
  }

  return serviceOk({ gameId });
}
