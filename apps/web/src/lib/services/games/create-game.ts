import type { SupabaseClient } from '@supabase/supabase-js';
import { createGameInputSchema, formatDate, formatTime } from '@baseball/shared';
import { postEventAlert } from '@/app/(app)/messages/notify';
import { provisionMirrorGame } from '@/lib/dual-scorekeeper/provision';
import { ensureTournamentOpponentTeam } from '@/lib/games/tournament-opponent-team';
import { invalidInput, serviceError, serviceOk, type ServiceResult } from '../result';
import { isActiveTeamCoach, isOpponentTeamAvailable, resolveGameSchedule, venueColumns } from './game-form-helpers';

const LOCATION_LABELS = { home: 'Home', away: 'Away', neutral: 'Neutral site' } as const;

/**
 * Schedules a game for a team. Only the team's active coaches may. A
 * tournament game is scoped to the tournament's own team and season; a
 * regular game joins the team's active season. With dual scorekeeping on, the
 * opponent's mirror game is provisioned too (best-effort).
 */
export async function createGame(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<{ gameId: string }>> {
  const parsed = createGameInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const input = parsed.data;

  if (!(await isActiveTeamCoach(db, actorUserId, input.teamId))) {
    return serviceError('forbidden', 'Only coaches can schedule games.');
  }

  const schedule = resolveGameSchedule(input);
  if (!schedule.ok) return schedule;

  let opponentTeamId: string | null = null;
  if (!input.opponentTbd && input.opponentTeamId) {
    const available = await isOpponentTeamAvailable(db, input.teamId, input.opponentTeamId);
    if (!available.ok) return available;
    if (!available.data) {
      return serviceError('invalid', 'Selected opponent team does not belong to your team or league.');
    }
    opponentTeamId = input.opponentTeamId;
  }

  // Tournament games are scoped to the exact tournament team/season tuple;
  // never trust a team or season the client supplies.
  let seasonId: string | null = null;
  if (input.tournamentId) {
    const { data: tournamentTeam } = await db
      .from('tournament_teams')
      .select('team_id, season_id')
      .eq('tournament_id', input.tournamentId)
      .eq('team_id', input.teamId)
      .maybeSingle();
    if (!tournamentTeam) return serviceError('invalid', 'This team is not registered for the selected tournament.');
    seasonId = tournamentTeam.season_id as string | null;

    // A typed-in tournament opponent gets its own opponent team record so the
    // opponent roster and lineup can sync to the phone that scores the game.
    if (!input.opponentTbd && !opponentTeamId) {
      const ensured = await ensureTournamentOpponentTeam(db, {
        teamId: input.teamId,
        opponentName: input.opponentName!,
        userId: actorUserId,
      });
      if ('error' in ensured) return serviceError('failed', ensured.error);
      opponentTeamId = ensured.opponentTeamId;
    }
  } else {
    const { data: activeSeason } = await db
      .from('seasons')
      .select('id')
      .eq('team_id', input.teamId)
      .eq('is_active', true)
      .maybeSingle();
    seasonId = (activeSeason?.id as string | undefined) ?? null;
  }

  const { data: game, error } = await db
    .from('games')
    .insert({
      team_id: input.teamId,
      opponent_name: input.opponentTbd ? null : input.opponentName,
      opponent_team_id: input.opponentTbd ? null : opponentTeamId,
      scheduled_at: schedule.data.scheduledAt,
      time_zone: schedule.data.timeZone,
      location_type: input.locationType,
      neutral_home_team: input.locationType === 'neutral' ? (input.neutralHomeTeam ?? 'us') : null,
      ...venueColumns(input.venue),
      notes: input.notes,
      created_by: actorUserId,
      season_id: seasonId,
      tournament_id: input.tournamentId,
    })
    .select()
    .single();
  if (error || !game) {
    console.error(`[createGame] team=${input.teamId} actor=${actorUserId} insert failed:`, error);
    return serviceError('failed', `Failed to create game: ${error?.message ?? 'no row returned'}`);
  }

  await provisionMirrorGame(db, game, actorUserId);

  // A TBD opponent isn't worth an announcement; coaches announce once it's known.
  if (input.notifyTeam && !input.opponentTbd) {
    const { scheduledAt, timeZone } = schedule.data;
    const msg = `📅 New game scheduled: vs. ${input.opponentName} — ${formatDate(scheduledAt, timeZone)} at ${formatTime(scheduledAt, timeZone)} (${LOCATION_LABELS[input.locationType]})`;
    await postEventAlert(db, input.teamId, actorUserId, msg);
  }

  return serviceOk({ gameId: game.id as string });
}
