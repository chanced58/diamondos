import type { SupabaseClient } from '@supabase/supabase-js';
import { getMaxBattingOrder } from '@baseball/shared';
import { getScoringSettingsForGame } from '@/lib/game-scoring-settings';
import { serviceError, serviceOk, type ServiceResult } from '../result';
import { authorizeGameCoach } from '../games/authorize';

export interface OpponentLineupGame {
  gameId: string;
  teamId: string;
  opponentName: string | null;
  opponentTeamId: string | null;
  tournamentId: string | null;
}

/**
 * A coach of the game may edit its opponent team, roster and order — except a
 * tournament game once it starts, whose lineup changes go through the scorer's
 * lineup events (the tournament write guards would reject a direct edit).
 */
export async function authorizeOpponentLineupEdit(
  db: SupabaseClient,
  actorUserId: string,
  gameId: string,
): Promise<ServiceResult<OpponentLineupGame>> {
  const auth = await authorizeGameCoach(db, actorUserId, gameId);
  if (!auth.ok) return auth;
  const game = auth.data;

  if (game.tournament_id && game.status !== 'scheduled') {
    return serviceError('conflict', 'A started tournament game changes its lineup from the scorer.');
  }

  return serviceOk({
    gameId,
    teamId: game.team_id as string,
    opponentName: (game.opponent_name as string | null) ?? null,
    opponentTeamId: (game.opponent_team_id as string | null) ?? null,
    tournamentId: (game.tournament_id as string | null) ?? null,
  });
}

/** The league or tournament batting-order cap for the game. */
export async function loadMaxBatters(db: SupabaseClient, game: OpponentLineupGame): Promise<ServiceResult<number>> {
  const { data, error } = await db
    .from('games')
    .select('scoring_settings_snapshot')
    .eq('id', game.gameId)
    .maybeSingle();
  if (error) {
    console.error(`[opponent-lineup] game=${game.gameId} settings snapshot read failed:`, error);
    return serviceError('failed', 'Failed to load the game rules.');
  }
  try {
    const settings = await getScoringSettingsForGame(db, {
      teamId: game.teamId,
      tournamentId: game.tournamentId,
      scoringSettingsSnapshot: data?.scoring_settings_snapshot ?? null,
    });
    return serviceOk(getMaxBattingOrder(settings));
  } catch (err) {
    console.error(`[opponent-lineup] game=${game.gameId} scoring settings failed:`, err);
    return serviceError('failed', 'Failed to load the game rules.');
  }
}

/**
 * Bumps the game's updated_at (the touch trigger sets it). Phones re-read a
 * game's opponent order only when the game row changes — the lineup table
 * has no updated_at — so every order edit must touch the game.
 */
export async function touchGame(db: SupabaseClient, gameId: string): Promise<void> {
  const { error } = await db.from('games').update({ updated_at: new Date().toISOString() }).eq('id', gameId);
  // The edit itself succeeded; phones just pick it up on a later game change.
  if (error) console.error(`[opponent-lineup] game=${gameId} touch failed:`, error);
}

export function writeFailed(service: string, gameId: string, actorUserId: string, error: { message?: string }) {
  console.error(`[${service}] game=${gameId} actor=${actorUserId} failed:`, error);
  return serviceError<never>('failed', `Failed to save: ${error.message ?? 'unknown error'}`);
}
