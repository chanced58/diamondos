import type { SupabaseClient } from '@supabase/supabase-js';
import { updateGameInputSchema } from '@baseball/shared';
import { ensureTournamentOpponentTeam } from '@/lib/games/tournament-opponent-team';
import { invalidInput, serviceError, serviceOk, type ServiceResult } from '../result';
import {
  isActiveTeamCoach,
  isOpponentTeamAvailable,
  isPlatformAdmin,
  resolveGameSchedule,
  venueColumns,
} from './game-form-helpers';

/**
 * Edits a game's opponent, time, location, venue and notes. Platform admins
 * and the team's active coaches may. Once play has started the opponent can't
 * go back to TBD — that would orphan the game's events and stats.
 */
export async function updateGame(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<{ gameId: string }>> {
  const parsed = updateGameInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const input = parsed.data;

  const { data: game } = await db
    .from('games')
    .select('team_id, status, time_zone, tournament_id')
    .eq('id', input.gameId)
    .maybeSingle();
  if (!game) return serviceError('not_found', 'Game not found.');
  const teamId = game.team_id as string;

  const allowed = (await isPlatformAdmin(db, actorUserId)) || (await isActiveTeamCoach(db, actorUserId, teamId));
  if (!allowed) return serviceError('forbidden', 'Only coaches can edit games.');

  if (input.opponentTbd && (game.status === 'in_progress' || game.status === 'completed')) {
    return serviceError('conflict', 'Cannot clear the opponent on a game that has started or completed.');
  }

  let opponentTeamId: string | null = null;
  if (!input.opponentTbd && input.opponentTeamId) {
    const available = await isOpponentTeamAvailable(db, teamId, input.opponentTeamId);
    if (!available.ok) return available;
    if (!available.data) {
      return serviceError('invalid', 'Selected opponent team not found or not accessible.');
    }
    opponentTeamId = input.opponentTeamId;
  }

  // As on create: a typed-in tournament opponent (a bracket slot being filled
  // in) gets an opponent team record so its roster syncs to the scorer.
  if (!input.opponentTbd && !opponentTeamId && game.tournament_id) {
    const ensured = await ensureTournamentOpponentTeam(db, {
      teamId,
      opponentName: input.opponentName!,
      userId: actorUserId,
    });
    if ('error' in ensured) return serviceError('failed', ensured.error);
    opponentTeamId = ensured.opponentTeamId;
  }

  // Without new venue coordinates the game keeps the zone it was scheduled in.
  const schedule = resolveGameSchedule(input, game.time_zone as string | null);
  if (!schedule.ok) return schedule;

  const { error } = await db
    .from('games')
    .update({
      opponent_name: input.opponentTbd ? null : input.opponentName,
      opponent_team_id: input.opponentTbd ? null : opponentTeamId,
      scheduled_at: schedule.data.scheduledAt,
      time_zone: schedule.data.timeZone,
      location_type: input.locationType,
      neutral_home_team: input.locationType === 'neutral' ? (input.neutralHomeTeam ?? 'us') : null,
      ...venueColumns(input.venue),
      notes: input.notes,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.gameId);
  if (error) {
    console.error(`[updateGame] game=${input.gameId} actor=${actorUserId} update failed:`, error);
    return serviceError('failed', `Failed to update game: ${error.message}`);
  }

  return serviceOk({ gameId: input.gameId });
}
