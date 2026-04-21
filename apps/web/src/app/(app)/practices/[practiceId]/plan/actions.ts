'use server';

import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/supabase/server';
import {
  PracticeBlockType,
  PracticeFieldSpace,
  PracticeWeatherMode,
} from '@baseball/shared';
import {
  applyWeatherSwap,
  assignPlayersToBlock,
  deleteBlock,
  instantiatePracticeFromTemplate,
  persistCompressedBlocks,
  reorderBlocks,
  upsertBlock,
} from '@baseball/database';
import {
  assertCanEditBlock,
  assertHeadCoachOrAD,
  createPracticeServiceClient,
} from '@/lib/practices/authz';

type Result = { error?: string };

type ServiceClient = ReturnType<typeof createPracticeServiceClient>;

type AuthorizeResult =
  | { error: string; supabase?: undefined; userId?: undefined; teamId?: undefined }
  | { error?: undefined; supabase: ServiceClient; userId: string; teamId: string };

/**
 * Authorization primitive for plan-editor actions. Loads the practice, confirms
 * the caller is authenticated, and (if requireHeadCoachOrAD) gates on HC/AD.
 * Returns a service-role client (RLS bypassed) so mutation helpers can operate
 * atomically; downstream scope guards enforce id-cross-practice safety.
 */
async function authorize(
  practiceId: string,
  requireHeadCoachOrAD: boolean,
): Promise<AuthorizeResult> {
  const auth = createServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) return { error: 'Not authenticated.' };

  const supabase = createPracticeServiceClient();
  const { data } = await supabase
    .from('practices')
    .select('team_id')
    .eq('id', practiceId)
    .maybeSingle();
  if (!data) return { error: 'Practice not found.' };
  const teamId = data.team_id as string;

  try {
    if (requireHeadCoachOrAD) {
      await assertHeadCoachOrAD(supabase, user.id, teamId);
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Not authorized.' };
  }
  return { supabase, userId: user.id, teamId };
}

/**
 * Columns on practice_blocks that the BEFORE UPDATE trigger
 * `trg_practice_blocks_enforce_owner_update` (migration
 * 20260421000008_practice_blocks_ownership_rls.sql) rejects when an assistant
 * coach changes them. Kept in this single place so the client-facing structural
 * diff and the UI-level gating stay in lockstep with the database trigger;
 * if you add/remove a column in the trigger, update this list too.
 *
 * `practice_id` is included for strict parity with the trigger even though the
 * current UI flow never moves a block between practices.
 */
export const STRUCTURAL_BLOCK_COLUMNS = [
  'position',
  'block_type',
  'planned_duration_minutes',
  'drill_id',
  'assigned_coach_id',
  'practice_id',
] as const;

/**
 * Cross-scope guards. The service-role client bypasses RLS, so after
 * authorization confirms the caller's role on the target practice's team,
 * we must still verify that every resource id the caller *passes in* lives
 * inside that practice's scope. Otherwise a coach on team A could mutate a
 * block owned by a practice on team B by substituting its id.
 */
async function assertBlockInPractice(
  supabase: ServiceClient,
  practiceId: string,
  blockId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('practice_blocks')
    .select('id')
    .eq('id', blockId)
    .eq('practice_id', practiceId)
    .maybeSingle();
  return data ? null : `Block ${blockId} is not part of this practice.`;
}

async function assertBlocksInPractice(
  supabase: ServiceClient,
  practiceId: string,
  blockIds: string[],
): Promise<string | null> {
  if (blockIds.length === 0) return null;
  const unique = Array.from(new Set(blockIds));
  const { data } = await supabase
    .from('practice_blocks')
    .select('id')
    .eq('practice_id', practiceId)
    .in('id', unique);
  const found = new Set(((data ?? []) as Array<{ id: string }>).map((r) => r.id));
  const missing = unique.filter((id) => !found.has(id));
  return missing.length > 0
    ? `Block(s) not part of this practice: ${missing.join(', ')}`
    : null;
}

async function assertTemplateInTeam(
  supabase: ServiceClient,
  teamId: string,
  templateId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('practice_templates')
    .select('id')
    .eq('id', templateId)
    .eq('team_id', teamId)
    .maybeSingle();
  return data ? null : `Template ${templateId} is not on this team.`;
}

async function assertPlayersOnTeam(
  supabase: ServiceClient,
  teamId: string,
  playerIds: string[],
): Promise<string | null> {
  if (playerIds.length === 0) return null;
  const unique = Array.from(new Set(playerIds));
  const { data } = await supabase
    .from('players')
    .select('id')
    .eq('team_id', teamId)
    .in('id', unique);
  const found = new Set(((data ?? []) as Array<{ id: string }>).map((r) => r.id));
  const missing = unique.filter((id) => !found.has(id));
  return missing.length > 0
    ? `Player(s) not on this team: ${missing.join(', ')}`
    : null;
}

async function assertCoachOnTeamActive(
  supabase: ServiceClient,
  teamId: string,
  userId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('team_members')
    .select('role, is_active')
    .eq('team_id', teamId)
    .eq('user_id', userId)
    .maybeSingle();
  if (!data || data.is_active !== true) {
    return 'User is not an active member of this team.';
  }
  const role = data.role as string;
  if (role !== 'head_coach' && role !== 'assistant_coach' && role !== 'athletic_director') {
    return 'User is not a coach on this team.';
  }
  return null;
}

/**
 * Diff-structural helper: given an UpsertBlock call with an existing id, load
 * the current row and decide whether the patch touches any structural field
 * (see STRUCTURAL_BLOCK_COLUMNS and the DB trigger it mirrors). Used to route
 * between HC/AD-only and block-owner guards.
 *
 * The column list here MUST stay in sync with the
 * `trg_practice_blocks_enforce_owner_update` trigger in
 * 20260421000008_practice_blocks_ownership_rls.sql — if the trigger adds or
 * removes a structural column, update STRUCTURAL_BLOCK_COLUMNS and the
 * comparisons below together.
 *
 * `practice_id` is enforced by the cross-scope guard (assertBlockInPractice)
 * rather than compared here, so a block cannot move between practices via
 * this path; if we ever accept that field in UpsertBlockInput, add it below.
 */
async function detectStructuralChange(
  supabase: ServiceClient,
  blockId: string,
  patch: {
    position: number;
    blockType: PracticeBlockType;
    plannedDurationMinutes: number;
    drillId?: string | null;
    assignedCoachId?: string | null;
  },
): Promise<
  | { error: string }
  | { structural: boolean; existingAssignedCoachId: string | null }
> {
  const { data, error } = await supabase
    .from('practice_blocks')
    .select(
      'position, block_type, planned_duration_minutes, drill_id, assigned_coach_id',
    )
    .eq('id', blockId)
    .maybeSingle();
  if (error) return { error: `Failed to load block: ${error.message}` };
  if (!data) return { error: 'Block not found.' };
  const row = data as unknown as {
    position: number;
    block_type: string;
    planned_duration_minutes: number;
    drill_id: string | null;
    assigned_coach_id: string | null;
  };
  const structural =
    row.position !== patch.position ||
    row.block_type !== patch.blockType ||
    row.planned_duration_minutes !== patch.plannedDurationMinutes ||
    (patch.drillId !== undefined && (row.drill_id ?? null) !== (patch.drillId ?? null)) ||
    (patch.assignedCoachId !== undefined &&
      (row.assigned_coach_id ?? null) !== (patch.assignedCoachId ?? null));
  return { structural, existingAssignedCoachId: row.assigned_coach_id };
}

export async function instantiateFromTemplateAction(args: {
  practiceId: string;
  templateId: string;
}): Promise<Result> {
  const check = await authorize(args.practiceId, true);
  if (check.error !== undefined) return { error: check.error };
  const scopeErr = await assertTemplateInTeam(check.supabase, check.teamId, args.templateId);
  if (scopeErr) return { error: scopeErr };
  try {
    await instantiatePracticeFromTemplate(check.supabase, args);
    revalidatePath(`/practices/${args.practiceId}/plan`);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to instantiate.' };
  }
}

export async function upsertBlockAction(args: {
  id?: string;
  practiceId: string;
  position: number;
  blockType: PracticeBlockType;
  title: string;
  plannedDurationMinutes: number;
  drillId?: string | null;
  assignedCoachId?: string | null;
  fieldSpaces: PracticeFieldSpace[];
  notes?: string;
}): Promise<Result & { blockId?: string }> {
  // Creates require HC/AD; updates require HC/AD if structural, else block owner.
  const isCreate = !args.id;
  // Start with authn only; role is determined per-path below.
  const check = await authorize(args.practiceId, isCreate);
  if (check.error !== undefined) return { error: check.error };

  if (args.id) {
    const scopeErr = await assertBlockInPractice(
      check.supabase,
      args.practiceId,
      args.id,
    );
    if (scopeErr) return { error: scopeErr };

    const diff = await detectStructuralChange(check.supabase, args.id, {
      position: args.position,
      blockType: args.blockType,
      plannedDurationMinutes: args.plannedDurationMinutes,
      drillId: args.drillId,
      assignedCoachId: args.assignedCoachId,
    });
    if ('error' in diff) return { error: diff.error };

    try {
      if (diff.structural) {
        await assertHeadCoachOrAD(check.supabase, check.userId, check.teamId);
      } else {
        await assertCanEditBlock(check.supabase, check.userId, args.id);
      }
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Not authorized.' };
    }

    // Preserve existing assigned_coach_id when the caller doesn't specify one.
    // (Content-only saves from the editor don't carry the owner through the
    // patch — without this, upsertBlock would wipe the assignment.)
    const assignedCoachId =
      args.assignedCoachId === undefined
        ? diff.existingAssignedCoachId
        : args.assignedCoachId;

    try {
      const block = await upsertBlock(check.supabase, {
        ...args,
        assignedCoachId,
      });
      revalidatePath(`/practices/${args.practiceId}/plan`);
      return { blockId: block.id };
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Failed to save block.' };
    }
  }

  try {
    const block = await upsertBlock(check.supabase, args);
    revalidatePath(`/practices/${args.practiceId}/plan`);
    return { blockId: block.id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to save block.' };
  }
}

export async function setBlockAssignedCoachAction(args: {
  practiceId: string;
  blockId: string;
  coachUserId: string | null;
}): Promise<Result> {
  const check = await authorize(args.practiceId, true);
  if (check.error !== undefined) return { error: check.error };
  const scopeErr = await assertBlockInPractice(
    check.supabase,
    args.practiceId,
    args.blockId,
  );
  if (scopeErr) return { error: scopeErr };
  if (args.coachUserId) {
    const membershipErr = await assertCoachOnTeamActive(
      check.supabase,
      check.teamId,
      args.coachUserId,
    );
    if (membershipErr) return { error: membershipErr };
  }
  try {
    const { error } = await check.supabase
      .from('practice_blocks')
      .update({ assigned_coach_id: args.coachUserId } as never)
      .eq('id', args.blockId);
    if (error) throw error;
    revalidatePath(`/practices/${args.practiceId}/plan`);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to reassign block.' };
  }
}

export async function deleteBlockAction(args: {
  practiceId: string;
  blockId: string;
}): Promise<Result> {
  const check = await authorize(args.practiceId, true);
  if (check.error !== undefined) return { error: check.error };
  const scopeErr = await assertBlockInPractice(check.supabase, args.practiceId, args.blockId);
  if (scopeErr) return { error: scopeErr };
  try {
    await deleteBlock(check.supabase, args.blockId);
    revalidatePath(`/practices/${args.practiceId}/plan`);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to delete block.' };
  }
}

export async function reorderBlocksAction(args: {
  practiceId: string;
  orderedBlockIds: string[];
}): Promise<Result> {
  const check = await authorize(args.practiceId, true);
  if (check.error !== undefined) return { error: check.error };
  const scopeErr = await assertBlocksInPractice(
    check.supabase,
    args.practiceId,
    args.orderedBlockIds,
  );
  if (scopeErr) return { error: scopeErr };
  try {
    await reorderBlocks(check.supabase, args.practiceId, args.orderedBlockIds);
    revalidatePath(`/practices/${args.practiceId}/plan`);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to reorder.' };
  }
}

export async function assignPlayersAction(args: {
  practiceId: string;
  blockId: string;
  playerIds: string[];
}): Promise<Result> {
  const check = await authorize(args.practiceId, true);
  if (check.error !== undefined) return { error: check.error };
  const blockErr = await assertBlockInPractice(check.supabase, args.practiceId, args.blockId);
  if (blockErr) return { error: blockErr };
  const playersErr = await assertPlayersOnTeam(check.supabase, check.teamId, args.playerIds);
  if (playersErr) return { error: playersErr };
  try {
    await assignPlayersToBlock(check.supabase, args.blockId, args.playerIds);
    revalidatePath(`/practices/${args.practiceId}/plan`);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to assign players.' };
  }
}

export async function applyWeatherSwapAction(args: {
  practiceId: string;
  targetMode: PracticeWeatherMode;
  indoorTemplateId?: string;
}): Promise<Result> {
  const check = await authorize(args.practiceId, true);
  if (check.error !== undefined) return { error: check.error };
  if (args.indoorTemplateId) {
    const scopeErr = await assertTemplateInTeam(
      check.supabase,
      check.teamId,
      args.indoorTemplateId,
    );
    if (scopeErr) return { error: scopeErr };
  }
  try {
    await applyWeatherSwap(check.supabase, args);
    revalidatePath(`/practices/${args.practiceId}/plan`);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to swap weather.' };
  }
}

export async function compressRemainingAction(args: {
  practiceId: string;
  updates: Array<{ id: string; plannedDurationMinutes: number }>;
}): Promise<Result> {
  const check = await authorize(args.practiceId, true);
  if (check.error !== undefined) return { error: check.error };
  const scopeErr = await assertBlocksInPractice(
    check.supabase,
    args.practiceId,
    args.updates.map((u) => u.id),
  );
  if (scopeErr) return { error: scopeErr };
  try {
    await persistCompressedBlocks(check.supabase, args.updates);
    revalidatePath(`/practices/${args.practiceId}/plan`);
    revalidatePath(`/practices/${args.practiceId}/run`);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to compress.' };
  }
}
