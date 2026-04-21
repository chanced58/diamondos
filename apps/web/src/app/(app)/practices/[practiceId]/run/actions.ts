'use server';

import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/supabase/server';
import {
  completeBlock,
  markPracticeCompleted,
  markPracticeStarted,
  setActiveBlock,
  skipBlock,
  startBlock,
} from '@baseball/database';
import {
  assertCoachOnTeam,
  createPracticeServiceClient,
} from '@/lib/practices/authz';

type Result = { error?: string };

async function verifyCoach(practiceId: string) {
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
  return { supabase };
}

export async function startPracticeAction(args: {
  practiceId: string;
}): Promise<Result> {
  const check = await verifyCoach(args.practiceId);
  if (check.error || !check.supabase) return { error: check.error };
  try {
    await markPracticeStarted(check.supabase, args.practiceId, new Date().toISOString());
    revalidatePath(`/practices/${args.practiceId}/run`);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to start practice.' };
  }
}

export async function startBlockAction(args: {
  practiceId: string;
  blockId: string;
}): Promise<Result> {
  const check = await verifyCoach(args.practiceId);
  if (check.error || !check.supabase) return { error: check.error };
  try {
    const now = new Date().toISOString();
    await startBlock(check.supabase, args.blockId, now);
    await setActiveBlock(check.supabase, args.practiceId, args.blockId);
    revalidatePath(`/practices/${args.practiceId}/run`);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to start block.' };
  }
}

export async function completeBlockAction(args: {
  practiceId: string;
  blockId: string;
  actualDurationMinutes: number;
}): Promise<Result> {
  const check = await verifyCoach(args.practiceId);
  if (check.error || !check.supabase) return { error: check.error };
  try {
    await completeBlock(
      check.supabase,
      args.blockId,
      new Date().toISOString(),
      Math.max(0, Math.round(args.actualDurationMinutes)),
    );
    revalidatePath(`/practices/${args.practiceId}/run`);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to complete block.' };
  }
}

export async function skipBlockAction(args: {
  practiceId: string;
  blockId: string;
}): Promise<Result> {
  const check = await verifyCoach(args.practiceId);
  if (check.error || !check.supabase) return { error: check.error };
  try {
    await skipBlock(check.supabase, args.blockId);
    revalidatePath(`/practices/${args.practiceId}/run`);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to skip block.' };
  }
}

export async function completePracticeAction(args: {
  practiceId: string;
}): Promise<Result> {
  const check = await verifyCoach(args.practiceId);
  if (check.error || !check.supabase) return { error: check.error };
  try {
    await markPracticeCompleted(
      check.supabase,
      args.practiceId,
      new Date().toISOString(),
    );
    await setActiveBlock(check.supabase, args.practiceId, null);
    revalidatePath(`/practices/${args.practiceId}/run`);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to complete practice.' };
  }
}
