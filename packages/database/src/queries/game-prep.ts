import type { SuggestedBlock } from '@baseball/shared';
import { PracticeBlockStatus } from '@baseball/shared';
import type { TypedSupabaseClient } from '../client';

/**
 * Creates a prep practice from a generator output. Single transaction via
 * sequential inserts — if the blocks insert fails, the practice is cleaned
 * up manually. Intentionally avoids RPC because Supabase doesn't give us
 * cross-table transactional semantics from the client without custom RPCs,
 * and the callsite (server action) can await the cleanup.
 */
export async function createPrepPractice(
  supabase: TypedSupabaseClient,
  args: {
    teamId: string;
    linkedGameId: string;
    scheduledAt: string;
    durationMinutes: number;
    prepFocusSummary: string;
    blocks: SuggestedBlock[];
    createdBy: string;
  },
): Promise<{ practiceId: string }> {
  const totalPlanned = args.blocks.reduce((n, b) => n + b.plannedDurationMinutes, 0);

  const { data: practice, error: practiceErr } = await supabase
    .from('practices')
    .insert({
      team_id: args.teamId,
      scheduled_at: args.scheduledAt,
      duration_minutes: args.durationMinutes,
      linked_game_id: args.linkedGameId,
      prep_focus_summary: args.prepFocusSummary,
      total_planned_minutes: totalPlanned,
      created_by: args.createdBy,
    } as never)
    .select('id')
    .single();
  if (practiceErr) throw practiceErr;

  const practiceId = (practice as { id: string }).id;

  if (args.blocks.length > 0) {
    const blockRows = args.blocks.map((b) => ({
      practice_id: practiceId,
      position: b.position,
      block_type: b.blockType,
      title: b.title,
      planned_duration_minutes: b.plannedDurationMinutes,
      drill_id: b.drillId ?? null,
      field_spaces: [],
      status: PracticeBlockStatus.PENDING,
      notes: b.rationale,
    }));

    const { error: blocksErr } = await supabase
      .from('practice_blocks')
      .insert(blockRows as never);

    if (blocksErr) {
      // Best-effort rollback: remove the practice row we just inserted.
      // Blocks either didn't land or the row FK-cascades them.
      await supabase.from('practices').delete().eq('id', practiceId);
      throw blocksErr;
    }
  }

  return { practiceId };
}

export interface LinkedPrepPractice {
  practiceId: string;
  linkedGameId: string;
  prepFocusSummary?: string;
  opponentName: string;
  scheduledAt: string;
}

/**
 * Loads the prep-practice header details: the linked game's opponent + date,
 * plus the stored focus summary. Used by the plan editor to render
 * "Prepping for: @Eastside HS · Fri".
 */
export async function getLinkedGameForPractice(
  supabase: TypedSupabaseClient,
  practiceId: string,
): Promise<LinkedPrepPractice | null> {
  const { data, error } = await supabase
    .from('practices')
    .select('id, linked_game_id, prep_focus_summary, games:linked_game_id(opponent_name, scheduled_at)')
    .eq('id', practiceId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const row = data as unknown as {
    id: string;
    linked_game_id: string | null;
    prep_focus_summary: string | null;
    games: { opponent_name: string; scheduled_at: string } | null;
  };

  if (!row.linked_game_id || !row.games) return null;

  return {
    practiceId: row.id,
    linkedGameId: row.linked_game_id,
    prepFocusSummary: row.prep_focus_summary ?? undefined,
    opponentName: row.games.opponent_name,
    scheduledAt: row.games.scheduled_at,
  };
}

