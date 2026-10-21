import type { SupabaseClient } from '@supabase/supabase-js';
import { gameIdInputSchema, type OpponentLineupResponse } from '@baseball/shared';
import { invalidInput, serviceError, serviceOk, type ServiceResult } from '../result';
import { authorizeOpponentLineupEdit, loadMaxBatters } from './context';

/** The game's opponent team, active roster and batting order, for the coach editing them. */
export async function loadOpponentLineup(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<OpponentLineupResponse>> {
  const parsed = gameIdInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { gameId } = parsed.data;

  const auth = await authorizeOpponentLineupEdit(db, actorUserId, gameId);
  if (!auth.ok) return auth;
  const game = auth.data;

  const maxBatters = await loadMaxBatters(db, game);
  if (!maxBatters.ok) return maxBatters;

  const [teamResult, playersResult, lineupResult] = await Promise.all([
    game.opponentTeamId
      ? db.from('opponent_teams').select('id, name').eq('id', game.opponentTeamId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    game.opponentTeamId
      ? db
          .from('opponent_players')
          .select('id, first_name, last_name, jersey_number, primary_position')
          .eq('opponent_team_id', game.opponentTeamId)
          .eq('is_active', true)
          .order('last_name')
      : Promise.resolve({ data: [], error: null }),
    db.from('opponent_game_lineups').select('opponent_player_id, batting_order, starting_position').eq('game_id', gameId),
  ]);
  const error = teamResult.error ?? playersResult.error ?? lineupResult.error;
  if (error) {
    console.error(`[loadOpponentLineup] game=${gameId} actor=${actorUserId} read failed:`, error);
    return serviceError('failed', 'Failed to load the opponent lineup.');
  }

  const team = teamResult.data as { id: string; name: string } | null;
  return serviceOk({
    gameId,
    opponentName: game.opponentName,
    opponentTeam: team ? { id: team.id, name: team.name } : null,
    maxBatters: maxBatters.data,
    players: ((playersResult.data ?? []) as Record<string, unknown>[]).map((p) => ({
      id: p.id as string,
      firstName: p.first_name as string,
      lastName: p.last_name as string,
      jerseyNumber: (p.jersey_number as string | null) ?? null,
      primaryPosition: (p.primary_position as string | null) ?? null,
    })),
    lineup: ((lineupResult.data ?? []) as Record<string, unknown>[]).map((l) => ({
      opponentPlayerId: l.opponent_player_id as string,
      battingOrder: (l.batting_order as number | null) ?? null,
      startingPosition: (l.starting_position as string | null) ?? null,
    })),
  });
}
