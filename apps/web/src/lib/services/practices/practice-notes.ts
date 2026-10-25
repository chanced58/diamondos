import type { SupabaseClient } from '@supabase/supabase-js';
import {
  PRACTICE_NOTE_CATEGORIES,
  PRACTICE_REP_OUTCOME_DEFAULT_CATEGORY,
  logPracticeRepInputSchema,
  savePracticeNotesInputSchema,
  savePracticePlanInputSchema,
  savePracticeSelfNotesInputSchema,
} from '@baseball/shared';
import { insertPracticeReps } from '@baseball/database';
import { invalidInput, serviceError, serviceOk, type ServiceResult } from '../result';
import { resolveGameViewer } from '../games/authorize';
import { failed, loadPracticeRow } from './practice-lookup';

/**
 * What coaches and players write on a practice — the plan text, the coach's
 * notes, a player's own reflection, and BP reps — shared by the web practice
 * page and the mobile routes. Every action authorizes against the practice's
 * own team, never a team the caller names.
 */

export async function savePracticePlan(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<{ practiceId: string }>> {
  const parsed = savePracticePlanInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { practiceId, plan } = parsed.data;

  const coach = await authorizeCoach(db, 'savePracticePlan', practiceId, actorUserId, 'Only coaches can edit the practice plan.');
  if ('result' in coach) return coach.result;

  const { error } = await db.from('practices').update({ plan }).eq('id', practiceId);
  if (error) return failed('savePracticePlan', practiceId, actorUserId, error);
  return serviceOk({ practiceId });
}

/** Overall and coach notes, and the per-player notes sent; players not sent keep theirs. */
export async function savePracticeNotes(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<{ practiceId: string }>> {
  const parsed = savePracticeNotesInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const input = parsed.data;

  const coach = await authorizeCoach(db, 'savePracticeNotes', input.practiceId, actorUserId, 'Only coaches can save practice notes.');
  if ('result' in coach) return coach.result;
  const teamId = coach.practice.team_id;

  // Player notes may only name this team's players.
  const playerIds = [...new Set(input.players.map((p) => p.playerId))];
  if (playerIds.length > 0) {
    const { data: onTeam, error } = await db.from('players').select('id').eq('team_id', teamId).in('id', playerIds);
    if (error) return failed('savePracticeNotes', input.practiceId, actorUserId, error);
    if ((onTeam ?? []).length !== playerIds.length) return serviceError('invalid', 'A player in these notes is not on this team.');
  }

  const now = new Date().toISOString();
  const { error: notesError } = await db.from('practice_notes').upsert(
    {
      practice_id: input.practiceId,
      overall_notes: input.overallNotes,
      coach_notes: input.coachNotes,
      updated_by: actorUserId,
      updated_at: now,
    },
    { onConflict: 'practice_id' },
  );
  if (notesError) return failed('savePracticeNotes', input.practiceId, actorUserId, notesError);

  if (input.players.length > 0) {
    // player_notes is the player's own column and is never sent, so the upsert leaves it alone.
    const rows = input.players.map((player) => ({
      practice_id: input.practiceId,
      player_id: player.playerId,
      ...Object.fromEntries(PRACTICE_NOTE_CATEGORIES.map(({ key }) => [key, player[key]])),
      updated_by: actorUserId,
      updated_at: now,
    }));
    const { error } = await db.from('practice_player_notes').upsert(rows, { onConflict: 'practice_id,player_id' });
    if (error) return failed('savePracticeNotes', input.practiceId, actorUserId, error);
  }

  return serviceOk({ practiceId: input.practiceId });
}

/** A player's own reflection: only on their own player record, on a practice of their team. */
export async function savePracticeSelfNotes(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<{ practiceId: string }>> {
  const parsed = savePracticeSelfNotesInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { practiceId, playerId, playerNotes } = parsed.data;

  const { data: player, error: playerError } = await db
    .from('players')
    .select('id, team_id')
    .eq('id', playerId)
    .eq('user_id', actorUserId)
    .maybeSingle();
  if (playerError) return failed('savePracticeSelfNotes', practiceId, actorUserId, playerError);
  if (!player) return serviceError('forbidden', 'You can only write your own notes.');

  const lookup = await loadPracticeRow(db, 'savePracticeSelfNotes', practiceId, actorUserId);
  if ('result' in lookup) return lookup.result;
  if (lookup.practice.team_id !== player.team_id) return serviceError('not_found', 'Practice not found.');

  const { error } = await db.from('practice_player_notes').upsert(
    {
      practice_id: practiceId,
      player_id: playerId,
      player_notes: playerNotes,
      updated_by: actorUserId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'practice_id,player_id' },
  );
  if (error) return failed('savePracticeSelfNotes', practiceId, actorUserId, error);
  return serviceOk({ practiceId });
}

/** One BP rep for a hitter on the team; the outcome's default bucket (positive / neutral / negative) is applied. */
export async function logPracticeRep(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<{ practiceId: string }>> {
  const parsed = logPracticeRepInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const input = parsed.data;

  const coach = await authorizeCoach(db, 'logPracticeRep', input.practiceId, actorUserId, 'Only coaches can log reps.');
  if ('result' in coach) return coach.result;
  if (coach.practice.status === 'cancelled') return serviceError('conflict', 'Cannot log reps on a cancelled practice.');

  // RLS on practice_reps only checks the practice's team, so check the player's here.
  const { data: player, error: playerError } = await db.from('players').select('team_id').eq('id', input.playerId).maybeSingle();
  if (playerError) return failed('logPracticeRep', input.practiceId, actorUserId, playerError);
  if (!player || player.team_id !== coach.practice.team_id) return serviceError('invalid', 'Player is not on this team.');

  try {
    await insertPracticeReps(
      db as never,
      [
        {
          practiceId: input.practiceId,
          playerId: input.playerId,
          outcome: input.outcome,
          outcomeCategory: PRACTICE_REP_OUTCOME_DEFAULT_CATEGORY[input.outcome],
          coachTag: input.coachTag ?? undefined,
        },
      ],
      actorUserId,
    );
  } catch (error) {
    return failed('logPracticeRep', input.practiceId, actorUserId, error);
  }
  return serviceOk({ practiceId: input.practiceId });
}

async function authorizeCoach(db: SupabaseClient, service: string, practiceId: string, actorUserId: string, refusal: string) {
  const lookup = await loadPracticeRow(db, service, practiceId, actorUserId);
  if ('result' in lookup) return lookup;
  const viewer = await resolveGameViewer(db, actorUserId, lookup.practice.team_id);
  if (!viewer?.isCoach) return { result: serviceError('forbidden', refusal) as ServiceResult<never> };
  return lookup;
}
