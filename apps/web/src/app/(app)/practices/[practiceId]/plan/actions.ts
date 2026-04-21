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

export async function instantiateFromTemplateAction(args: {
  practiceId: string;
  templateId: string;
}): Promise<Result> {
  const check = await verifyCoach(args.practiceId);
  if (check.error || !check.supabase) return { error: check.error };
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
  if (check.error || !check.supabase) return { error: check.error };
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
  if (check.error || !check.supabase) return { error: check.error };
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
  try {
    await persistCompressedBlocks(check.supabase, args.updates);
    revalidatePath(`/practices/${args.practiceId}/plan`);
    revalidatePath(`/practices/${args.practiceId}/run`);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to compress.' };
  }
}
