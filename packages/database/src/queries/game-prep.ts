import type {
  PracticeDrill,
  PracticeDrillDeficitTag,
  SuggestedBlock,
} from '@baseball/shared';
import { PracticeDrillDeficitPriority, PracticeBlockStatus } from '@baseball/shared';
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

/**
 * Fetches drills + their deficit tags for the prep-practice generator.
 * The generator runs the tag map through `matchesDeficits()` / picks the
 * best-fit drill per target deficit, so returning both in one call keeps
 * the RSC path simple.
 */
export async function getDrillsWithDeficitTags(
  supabase: TypedSupabaseClient,
  teamId: string,
): Promise<{ drills: PracticeDrill[]; tagsByDrill: Map<string, PracticeDrillDeficitTag[]> }> {
  // Reuse the existing listDrills if available for drills; this module only
  // provides the tag index. The caller should have a drills array loaded
  // separately via `listDrills(supabase, teamId)`.
  const { data: tagRows, error } = await supabase
    .from('practice_drill_deficit_tags')
    .select('*')
    .or(`team_id.is.null,team_id.eq.${teamId}`);
  if (error) throw error;

  const tagsByDrill = new Map<string, PracticeDrillDeficitTag[]>();
  const rows = (tagRows ?? []) as unknown as Array<{
    id: string;
    drill_id: string;
    deficit_id: string;
    team_id: string | null;
    priority: string;
    created_by: string | null;
    created_at: string;
  }>;

  for (const r of rows) {
    const tag: PracticeDrillDeficitTag = {
      id: r.id,
      drillId: r.drill_id,
      deficitId: r.deficit_id,
      teamId: r.team_id,
      priority: r.priority as PracticeDrillDeficitPriority,
      createdBy: r.created_by ?? undefined,
      createdAt: r.created_at,
    };
    const bucket = tagsByDrill.get(tag.drillId);
    if (bucket) bucket.push(tag);
    else tagsByDrill.set(tag.drillId, [tag]);
  }

  return { drills: [], tagsByDrill };
}
