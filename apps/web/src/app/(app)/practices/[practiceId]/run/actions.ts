'use server';

import { revalidatePath } from 'next/cache';
import type { RunPracticeInput } from '@baseball/shared';
import { createServerClient } from '@/lib/supabase/server';
import { createPracticeServiceClient } from '@/lib/practices/authz';
import { runPractice } from '@/lib/services/practices/practice-run';

type Result = { error?: string };

/**
 * The runner's buttons, thin wrappers over `runPractice` (shared with
 * `POST /api/m/v1/practices/:id/run`): head coaches and athletic directors
 * start and finish the practice; a block's owner or a head coach controls it.
 */
async function run(input: RunPracticeInput): Promise<Result> {
  const auth = createServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) return { error: 'Not authenticated.' };

  const result = await runPractice(createPracticeServiceClient(), user.id, input);
  if (!result.ok) return { error: result.error };
  revalidatePath(`/practices/${input.practiceId}/run`);
  return {};
}

export async function startPracticeAction(args: { practiceId: string }): Promise<Result> {
  return run({ practiceId: args.practiceId, action: 'start' });
}

export async function startBlockAction(args: { practiceId: string; blockId: string }): Promise<Result> {
  return run({ practiceId: args.practiceId, action: 'startBlock', blockId: args.blockId });
}

export async function completeBlockAction(args: {
  practiceId: string;
  blockId: string;
  actualDurationMinutes: number;
}): Promise<Result> {
  return run({
    practiceId: args.practiceId,
    action: 'completeBlock',
    blockId: args.blockId,
    actualDurationMinutes: args.actualDurationMinutes,
  });
}

export async function skipBlockAction(args: { practiceId: string; blockId: string }): Promise<Result> {
  return run({ practiceId: args.practiceId, action: 'skipBlock', blockId: args.blockId });
}

export async function completePracticeAction(args: { practiceId: string }): Promise<Result> {
  return run({ practiceId: args.practiceId, action: 'complete' });
}
