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
  assertCoachOnTeam,
  createPracticeServiceClient,
} from '@/lib/practices/authz';

type Result = { error?: string };

async function verifyCoach(practiceId: string): Promise<{
  error?: string;
  supabase?: ReturnType<typeof createPracticeServiceClient>;
  userId?: string;
  teamId?: string;
}> {
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
  try {
    await assertCoachOnTeam(supabase, user.id, data.team_id as string);
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Not authorized.' };
  }
  return { supabase, userId: user.id, teamId: data.team_id as string };
}

/**
 * Cross-scope guards. The service-role client bypasses RLS, so after
 * verifyCoach confirms the caller is a coach on the target practice's team,
 * we must still verify that every resource id the caller *passes in* lives
 * inside that practice's scope. Otherwise a coach on team A could mutate a
 * block owned by a practice on team B by substituting its id.
 */
async function assertBlockInPractice(
  supabase: ReturnType<typeof createPracticeServiceClient>,
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
  supabase: ReturnType<typeof createPracticeServiceClient>,
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
  supabase: ReturnType<typeof createPracticeServiceClient>,
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
  supabase: ReturnType<typeof createPracticeServiceClient>,
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

export async function instantiateFromTemplateAction(args: {
  practiceId: string;
  templateId: string;
}): Promise<Result> {
  const check = await verifyCoach(args.practiceId);
  if (check.error || !check.supabase || !check.teamId) return { error: check.error };
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
  const check = await verifyCoach(args.practiceId);
  if (check.error || !check.supabase) return { error: check.error };
  // On an update (id provided) make sure the block belongs to this practice.
  if (args.id) {
    const scopeErr = await assertBlockInPractice(check.supabase, args.practiceId, args.id);
    if (scopeErr) return { error: scopeErr };
  }
  try {
    const block = await upsertBlock(check.supabase, args);
    revalidatePath(`/practices/${args.practiceId}/plan`);
    return { blockId: block.id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to save block.' };
  }
}

export async function deleteBlockAction(args: {
  practiceId: string;
  blockId: string;
}): Promise<Result> {
  const check = await verifyCoach(args.practiceId);
  if (check.error || !check.supabase) return { error: check.error };
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
  const check = await verifyCoach(args.practiceId);
  if (check.error || !check.supabase) return { error: check.error };
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
  const check = await verifyCoach(args.practiceId);
  if (check.error || !check.supabase || !check.teamId) return { error: check.error };
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
  const check = await verifyCoach(args.practiceId);
  if (check.error || !check.supabase || !check.teamId) return { error: check.error };
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
  const check = await verifyCoach(args.practiceId);
  if (check.error || !check.supabase) return { error: check.error };
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
