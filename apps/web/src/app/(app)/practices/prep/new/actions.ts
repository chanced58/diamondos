'use server';

import { createClient } from '@supabase/supabase-js';
import type { SuggestedBlock } from '@baseball/shared';
import { createServerClient } from '@/lib/supabase/server';
import { getUserAccess } from '@/lib/user-access';
import { createPrepPractice } from '@baseball/database';

export interface CreatePrepInput {
  teamId: string;
  linkedGameId: string;
  scheduledAt: string;
  durationMinutes: number;
  prepFocusSummary: string;
  blocks: SuggestedBlock[];
}

export async function createPrepPracticeAction(
  input: CreatePrepInput,
): Promise<{ practiceId: string } | string> {
  const authClient = createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return 'Not authenticated — please log in again.';

  const { isCoach } = await getUserAccess(input.teamId, user.id);
  if (!isCoach) return 'Only coaches can create prep practices.';

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  try {
    const result = await createPrepPractice(db as never, {
      teamId: input.teamId,
      linkedGameId: input.linkedGameId,
      scheduledAt: input.scheduledAt,
      durationMinutes: input.durationMinutes,
      prepFocusSummary: input.prepFocusSummary,
      blocks: input.blocks,
      createdBy: user.id,
    });
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return `Failed to create prep practice: ${msg}`;
  }
}
