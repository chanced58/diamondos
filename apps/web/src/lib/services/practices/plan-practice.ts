import type { SupabaseClient } from '@supabase/supabase-js';
import { PracticeBlockType, planPracticeInputSchema } from '@baseball/shared';
import { invalidInput, serviceError, serviceOk, type ServiceResult } from '../result';
import { checkCoachOnTeam } from '@/lib/practices/authz';
import { failed, requirePracticePlanning } from './practice-lookup';

/**
 * A practice planned from drills (the web Plan practice page), shared with the
 * mobile route: the practice, the plan saved as coach notes, and a block per
 * drill the team can see, in the order picked. Coaches only, on a plan with
 * practice planning. The notes and blocks are best effort, as on the web: the
 * practice exists once it is created, and a failure there is logged.
 */

const ONE_YEAR_MS = 365 * 24 * 3600 * 1000;
const DEFAULT_BLOCK_MINUTES = 10;

export async function planPractice(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<{ practiceId: string }>> {
  const parsed = planPracticeInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const input = parsed.data;

  if (Math.abs(Date.parse(input.scheduledAt) - Date.now()) > ONE_YEAR_MS) {
    return serviceError('invalid', 'Practice date must be within a year of today.');
  }

  // An active coach on the team, as the web Plan practice action has always required (not an off-team platform admin).
  try {
    const { isCoach } = await checkCoachOnTeam(db, actorUserId, input.teamId);
    if (!isCoach) return serviceError('forbidden', 'Only coaches can plan practices.');
  } catch (error) {
    return failed('planPractice', input.teamId, actorUserId, error);
  }
  const gate = await requirePracticePlanning(db, input.teamId);
  if (gate) return gate;

  const { data: practice, error } = await db
    .from('practices')
    .insert({
      team_id: input.teamId,
      scheduled_at: input.scheduledAt,
      duration_minutes: input.durationMinutes,
      location: input.location,
      address: input.address,
      latitude: input.latitude,
      longitude: input.longitude,
      place_id: input.placeId,
      created_by: actorUserId,
    })
    .select('id')
    .single();
  if (error || !practice) return failed('planPractice', input.teamId, actorUserId, error);
  const practiceId = practice.id as string;

  if (input.plan) await savePlan(db, practiceId, input.plan, actorUserId);
  if (input.drillIds.length > 0) await addDrillBlocks(db, practiceId, input.teamId, input.drillIds);

  return serviceOk({ practiceId });
}

/** The plan becomes the coach's notes (practice_notes has no team or creator column). */
async function savePlan(db: SupabaseClient, practiceId: string, plan: string, actorUserId: string): Promise<void> {
  const { error } = await db
    .from('practice_notes')
    .upsert(
      { practice_id: practiceId, coach_notes: plan, updated_by: actorUserId, updated_at: new Date().toISOString() },
      { onConflict: 'practice_id' },
    );
  if (error) console.error(`[planPractice] failed to save the plan for practice ${practiceId}:`, error);
}

/** One custom block per drill the team can see (curated or its own), in the order picked; others are skipped. */
async function addDrillBlocks(db: SupabaseClient, practiceId: string, teamId: string, drillIds: string[]): Promise<void> {
  const { data: drillRows, error } = await db
    .from('practice_drills')
    .select('id, name, default_duration_minutes')
    .in('id', drillIds)
    .or(`team_id.eq.${teamId},visibility.eq.system`);
  if (error) {
    console.error(`[planPractice] failed to fetch drills for practice ${practiceId}:`, error);
    return;
  }

  const drillsById = new Map(
    ((drillRows ?? []) as Array<{ id: string; name: string; default_duration_minutes: number | null }>).map((d) => [d.id, d]),
  );
  const blockRows = drillIds.flatMap((id) => {
    const drill = drillsById.get(id);
    return drill ? [drill] : [];
  }).map((drill, position) => ({
    practice_id: practiceId,
    position,
    block_type: PracticeBlockType.CUSTOM,
    title: drill.name,
    planned_duration_minutes: drill.default_duration_minutes ?? DEFAULT_BLOCK_MINUTES,
    drill_id: drill.id,
    field_spaces: [],
  }));
  if (blockRows.length === 0) return;

  const { error: insertError } = await db.from('practice_blocks').insert(blockRows);
  if (insertError) console.error(`[planPractice] failed to insert practice_blocks for practice ${practiceId}:`, insertError);
}
