'use server';

import { createClient } from '@supabase/supabase-js';
import type { PracticeRepInput } from '@baseball/shared';
import { createServerClient } from '@/lib/supabase/server';
import { logPracticeRep } from '@/lib/services/practices/practice-notes';

/** Thin wrapper over `logPracticeRep`, shared with `POST /api/m/v1/practices/:id/reps`. */
export async function logRepAction(input: PracticeRepInput): Promise<{ ok: true } | string> {
  const authClient = createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return 'Not authenticated.';

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const result = await logPracticeRep(db, user.id, {
    practiceId: input.practiceId,
    playerId: input.playerId,
    outcome: input.outcome,
    coachTag: input.coachTag,
  });
  return result.ok ? { ok: true } : result.error;
}
