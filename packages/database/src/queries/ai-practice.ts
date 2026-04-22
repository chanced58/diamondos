import type { AiPracticePlan } from '@baseball/shared';
import { PracticeBlockStatus } from '@baseball/shared';
import type { TypedSupabaseClient } from '../client';

/**
 * Persists an AI-generated practice plan as practices + practice_blocks rows.
 * Mirrors createPrepPractice but without a linked_game_id (NL generation is
 * not tied to a specific upcoming game).
 *
 * If the blocks insert fails, the parent practice row is best-effort deleted.
 */
export async function createAiPractice(
  supabase: TypedSupabaseClient,
  args: {
    teamId: string;
    scheduledAt: string;
    durationMinutes: number;
    plan: AiPracticePlan;
    createdBy: string;
  },
): Promise<{ practiceId: string }> {
  const totalPlanned = args.plan.blocks.reduce(
    (n, b) => n + b.plannedDurationMinutes,
    0,
  );

  const { data: practice, error: practiceErr } = await supabase
    .from('practices')
    .insert({
      team_id: args.teamId,
      scheduled_at: args.scheduledAt,
      duration_minutes: args.durationMinutes,
      prep_focus_summary: args.plan.focusSummary,
      total_planned_minutes: totalPlanned,
      created_by: args.createdBy,
    } as never)
    .select('id')
    .single();
  if (practiceErr) throw practiceErr;

  const practiceId = (practice as { id: string }).id;

  if (args.plan.blocks.length > 0) {
    const blockRows = args.plan.blocks.map((b, i) => ({
      practice_id: practiceId,
      position: i,
      block_type: b.blockType,
      title: b.title,
      planned_duration_minutes: b.plannedDurationMinutes,
      drill_id: b.drillId ?? null,
      field_spaces: b.fieldSpaces,
      status: PracticeBlockStatus.PENDING,
      notes: b.rationale,
    }));

    const { error: blocksErr } = await supabase
      .from('practice_blocks')
      .insert(blockRows as never);

    if (blocksErr) {
      // Best-effort rollback. If this fails, the parent practice row is orphaned
      // — we surface the details in the thrown error so the caller can trace it.
      const { error: rollbackErr } = await supabase
        .from('practices')
        .delete()
        .eq('id', practiceId);
      if (rollbackErr) {
        throw new Error(
          `practice_blocks insert failed (${blocksErr.message}) and rollback failed for practice ${practiceId}: ${rollbackErr.message}`,
        );
      }
      throw blocksErr;
    }
  }

  return { practiceId };
}
