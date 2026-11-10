import type { SupabaseClient } from '@supabase/supabase-js';
import { gameIdInputSchema, leagueGameControlRefusal } from '@baseball/shared';
import { deriveScoresFromEvents } from '@/lib/games/finalize';
import { refreshLeagueGame } from '@/lib/league-games/refresh';
import { invalidInput, serviceError, serviceOk, type ServiceResult } from '../result';
import { authorizeGameCoach } from './authorize';

/**
 * Rewrites the game's stored score from a replay of its event log. Refused on
 * a row whose result the league wrote (it has no book of its own). A finished
 * league book refreshes its league game afterwards, so the league result
 * follows the corrected score.
 */
export async function recalculateScores(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<{ gameId: string; homeScore: number; awayScore: number }>> {
  const parsed = gameIdInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { gameId } = parsed.data;

  const auth = await authorizeGameCoach(db, actorUserId, gameId);
  if (!auth.ok) return auth;
  const game = auth.data;
  const refusal = leagueGameControlRefusal('recalculate', game);
  if (refusal) return serviceError('conflict', refusal);

  const { homeScore, awayScore } = await deriveScoresFromEvents(db, gameId);

  const { error } = await db
    .from('games')
    .update({ home_score: homeScore, away_score: awayScore, updated_at: new Date().toISOString() })
    .eq('id', gameId);
  if (error) {
    console.error(`[recalculateScores] game=${gameId} actor=${actorUserId} update failed:`, error);
    return serviceError('failed', `Failed to update scores: ${error.message}`);
  }

  // Best-effort: refreshLeagueGame logs and never throws.
  if (game.league_game_id && game.status === 'completed') {
    await refreshLeagueGame(db, game.league_game_id as string, actorUserId);
  }

  return serviceOk({ gameId, homeScore, awayScore });
}
