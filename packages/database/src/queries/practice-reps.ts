import {
  PracticeRepCoachTag,
  PracticeRepOutcomeCategory,
  type PracticeRep,
  type PracticeRepInput,
} from '@baseball/shared';
import type { TypedSupabaseClient } from '../client';

/** Insert one or more practice reps in a single round-trip. */
export async function insertPracticeReps(
  supabase: TypedSupabaseClient,
  reps: PracticeRepInput[],
  recordedBy: string,
): Promise<void> {
  if (reps.length === 0) return;
  const rows = reps.map((r) => ({
    practice_id: r.practiceId,
    block_id: r.blockId ?? null,
    drill_id: r.drillId ?? null,
    player_id: r.playerId ?? null,
    rep_number: r.repNumber ?? null,
    outcome: r.outcome,
    outcome_category: r.outcomeCategory,
    metrics: r.metrics ?? {},
    coach_tag: r.coachTag ?? null,
    recorded_by: recordedBy,
  }));
  const { error } = await supabase.from('practice_reps').insert(rows as never);
  if (error) throw error;
}

/**
 * Lists practice reps for a team with recorded_at >= sinceDate.
 * Filtering on recorded_at (not the practice's scheduled_at) matters when
 * reps are logged late against rescheduled or older practices — the
 * hot-hitter ranker cares about what was *recorded* recently, not what was
 * *scheduled* recently.
 */
export async function listTeamPracticeReps(
  supabase: TypedSupabaseClient,
  teamId: string,
  sinceDate: Date,
): Promise<PracticeRep[]> {
  // Team-scope via the practices join (no scheduled_at gate — reps are
  // filtered by recorded_at below).
  const { data: practices, error: practicesErr } = await supabase
    .from('practices')
    .select('id')
    .eq('team_id', teamId);
  if (practicesErr) throw practicesErr;

  const ids = ((practices ?? []) as Array<{ id: string }>).map((p) => p.id);
  if (ids.length === 0) return [];

  const { data: rows, error } = await supabase
    .from('practice_reps')
    .select('*')
    .in('practice_id', ids)
    .gte('recorded_at', sinceDate.toISOString())
    .order('recorded_at', { ascending: false });
  if (error) throw error;

  return ((rows ?? []) as unknown as Array<{
    id: string;
    practice_id: string;
    block_id: string | null;
    drill_id: string | null;
    player_id: string | null;
    rep_number: number | null;
    outcome: string;
    outcome_category: string;
    metrics: Record<string, unknown>;
    coach_tag: string | null;
    recorded_by: string | null;
    recorded_at: string;
  }>).map((r) => ({
    id: r.id,
    practiceId: r.practice_id,
    blockId: r.block_id ?? undefined,
    drillId: r.drill_id ?? undefined,
    playerId: r.player_id ?? undefined,
    repNumber: r.rep_number ?? undefined,
    outcome: r.outcome,
    outcomeCategory: r.outcome_category as PracticeRepOutcomeCategory,
    metrics: r.metrics ?? {},
    coachTag: (r.coach_tag ?? undefined) as PracticeRepCoachTag | undefined,
    recordedBy: r.recorded_by ?? undefined,
    recordedAt: r.recorded_at,
  }));
}
