import type { SupabaseClient } from '@supabase/supabase-js';
import { cancelGameInputSchema, formatDate } from '@baseball/shared';
import { postEventAlert } from '@/app/(app)/messages/notify';
import { invalidInput, serviceError, serviceOk, type ServiceResult } from '../result';
import { authorizeGameCoach } from './authorize';

/**
 * Marks a game cancelled (the record is kept). With `notifyTeam`, posts the
 * cancellation to the team's announcement channel — skipped for a TBD
 * opponent, where "Game vs. null" helps no one.
 */
export async function cancelGame(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<{ gameId: string }>> {
  const parsed = cancelGameInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { gameId, notifyTeam } = parsed.data;

  const auth = await authorizeGameCoach(db, actorUserId, gameId);
  if (!auth.ok) return auth;
  const game = auth.data;

  const { error } = await db
    .from('games')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', gameId);
  if (error) {
    console.error(`[cancelGame] game=${gameId} actor=${actorUserId} update failed:`, error);
    return serviceError('failed', `Failed to cancel game: ${error.message}`);
  }

  const opponent = game.opponent_name?.trim();
  if (notifyTeam && opponent) {
    const msg = `⚠️ Game vs. ${opponent} on ${formatDate(game.scheduled_at, game.time_zone)} has been cancelled.`;
    await postEventAlert(db, game.team_id, actorUserId, msg);
  }

  return serviceOk({ gameId });
}
