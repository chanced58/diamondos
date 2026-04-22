'use server';

import { createClient } from '@supabase/supabase-js';
import type { PracticeRepInput } from '@baseball/shared';
import { createServerClient } from '@/lib/supabase/server';
import { getUserAccess } from '@/lib/user-access';
import { insertPracticeReps } from '@baseball/database';

export async function logRepAction(input: PracticeRepInput): Promise<{ ok: true } | string> {
  const authClient = createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return 'Not authenticated.';

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: practice } = await db
    .from('practices')
    .select('team_id')
    .eq('id', input.practiceId)
    .single();
  if (!practice) return 'Practice not found.';

  const { isCoach } = await getUserAccess(practice.team_id, user.id);
  if (!isCoach) return 'Only coaches can log reps.';

  try {
    await insertPracticeReps(db as never, [input], user.id);
    return { ok: true };
  } catch (err) {
    return err instanceof Error ? `Failed: ${err.message}` : 'Failed to log rep.';
  }
}
