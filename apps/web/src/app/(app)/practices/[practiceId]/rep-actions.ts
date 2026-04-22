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

  // 1. Practice exists, not cancelled, belongs to a team the user coaches.
  const { data: practice } = await db
    .from('practices')
    .select('team_id, status')
    .eq('id', input.practiceId)
    .single();
  if (!practice) return 'Practice not found.';
  if (practice.status === 'cancelled') return 'Cannot log reps on a cancelled practice.';

  const { isCoach } = await getUserAccess(practice.team_id, user.id);
  if (!isCoach) return 'Only coaches can log reps.';

  // 2. If a player is named, it must belong to this practice's team. RLS on
  //    practice_reps doesn't enforce this — the policy only checks the
  //    practice's team_id, so a coach could otherwise log a rep referencing
  //    another team's player_id.
  if (input.playerId) {
    const { data: player } = await db
      .from('players')
      .select('team_id')
      .eq('id', input.playerId)
      .maybeSingle();
    if (!player || player.team_id !== practice.team_id) {
      return 'Player is not on this team.';
    }
  }

  try {
    await insertPracticeReps(db as never, [input], user.id);
    return { ok: true };
  } catch (err) {
    // Log the real error server-side; return a generic message to the client
    // so Supabase / constraint details don't leak.
    console.error('[logRepAction] insertPracticeReps failed', {
      practiceId: input.practiceId,
      playerId: input.playerId,
      err,
    });
    return 'Failed to log rep.';
  }
}
