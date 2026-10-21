import type { SupabaseClient } from '@supabase/supabase-js';
import { saveGameNotesInputSchema, savePlayerGameNotesInputSchema } from '@baseball/shared';
import { invalidInput, serviceError, serviceOk, type ServiceResult } from '../result';
import { authorizeGameCoach } from './authorize';

/** Blank text is stored as null, so "no notes" reads the same everywhere. */
function textOrNull(value: string | null): string | null {
  return value && value.trim() !== '' ? value : null;
}

/**
 * A coach saves a game's overall notes, coach-only notes and per-player
 * assessments. Each part is written only when present in the input, and each
 * player row replaces just the six assessment categories — never the player's
 * own self-reflection. The team is the game's, never one the caller names, and
 * every player must be on it.
 */
export async function saveGameNotes(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<{ gameId: string }>> {
  const parsed = saveGameNotesInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { gameId, overallNotes, coachNotes, players } = parsed.data;

  const auth = await authorizeGameCoach(db, actorUserId, gameId);
  if (!auth.ok) return auth;
  const teamId = auth.data.team_id as string;

  // Last entry wins for a repeated player; one upsert can't touch a row twice.
  const assessments = new Map(players.map((entry) => [entry.playerId, entry.assessment]));
  if (assessments.size > 0) {
    const { data: onTeam, error } = await db
      .from('players')
      .select('id')
      .eq('team_id', teamId)
      .in('id', [...assessments.keys()]);
    if (error) return saveFailed('saveGameNotes', gameId, actorUserId, 'player check', error);
    if ((onTeam ?? []).length !== assessments.size) {
      return serviceError('invalid', 'A player in these notes is not on this team.');
    }
  }

  const now = new Date().toISOString();

  if (overallNotes !== undefined) {
    const { error } = await db
      .from('game_notes')
      .upsert(
        { game_id: gameId, overall_notes: textOrNull(overallNotes), updated_by: actorUserId, updated_at: now },
        { onConflict: 'game_id' },
      );
    if (error) return saveFailed('saveGameNotes', gameId, actorUserId, 'overall notes', error);
  }

  // Coach-only notes live in their own table so RLS can hide them from players.
  if (coachNotes !== undefined) {
    const { error } = await db
      .from('game_coach_notes')
      .upsert(
        { game_id: gameId, coach_notes: textOrNull(coachNotes), updated_by: actorUserId, updated_at: now },
        { onConflict: 'game_id' },
      );
    if (error) return saveFailed('saveGameNotes', gameId, actorUserId, 'coach notes', error);
  }

  if (assessments.size > 0) {
    const rows = [...assessments.entries()].map(([playerId, assessment]) => ({
      game_id: gameId,
      player_id: playerId,
      pitching: textOrNull(assessment.pitching),
      hitting: textOrNull(assessment.hitting),
      fielding_catching: textOrNull(assessment.fieldingCatching),
      baserunning: textOrNull(assessment.baserunning),
      athleticism: textOrNull(assessment.athleticism),
      attitude: textOrNull(assessment.attitude),
      updated_by: actorUserId,
      updated_at: now,
    }));
    const { error } = await db.from('game_player_notes').upsert(rows, { onConflict: 'game_id,player_id' });
    if (error) return saveFailed('saveGameNotes', gameId, actorUserId, 'player notes', error);
  }

  return serviceOk({ gameId });
}

/**
 * A player saves their own self-reflection on a game of their team. Only the
 * account linked to the player record may write it — not a parent, not a
 * coach — and only the `player_notes` column is touched.
 */
export async function savePlayerGameNotes(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<{ gameId: string; playerId: string }>> {
  const parsed = savePlayerGameNotesInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { gameId, playerId, playerNotes } = parsed.data;

  const { data: player } = await db
    .from('players')
    .select('id, team_id')
    .eq('id', playerId)
    .eq('user_id', actorUserId)
    .maybeSingle();
  if (!player) return serviceError('forbidden', 'Player record not found for your account.');

  const { data: game } = await db
    .from('games')
    .select('id')
    .eq('id', gameId)
    .eq('team_id', player.team_id)
    .maybeSingle();
  if (!game) return serviceError('not_found', 'Game not found.');

  const { error } = await db
    .from('game_player_notes')
    .upsert(
      {
        game_id: gameId,
        player_id: playerId,
        player_notes: textOrNull(playerNotes),
        updated_by: actorUserId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'game_id,player_id' },
    );
  if (error) return saveFailed('savePlayerGameNotes', gameId, actorUserId, 'player notes', error);

  return serviceOk({ gameId, playerId });
}

function saveFailed(
  service: string,
  gameId: string,
  actorUserId: string,
  what: string,
  error: { message?: string },
): ServiceResult<never> {
  console.error(`[${service}] game=${gameId} actor=${actorUserId} ${what} failed:`, error);
  return serviceError('failed', `Failed to save notes: ${error.message ?? 'unknown error'}`);
}
