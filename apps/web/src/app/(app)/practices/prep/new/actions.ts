'use server';

import { createClient } from '@supabase/supabase-js';
import type { SuggestedBlock } from '@baseball/shared';
import { createServerClient } from '@/lib/supabase/server';
import { createPrepPracticeFromPlan } from '@/lib/services/practices/prep-practice';

export interface CreatePrepInput {
  teamId: string;
  linkedGameId: string;
  scheduledAt: string;
  durationMinutes: number;
  prepFocusSummary: string;
  blocks: SuggestedBlock[];
}

/**
 * Saves the previewed prep plan as a practice linked to the game; a thin
 * wrapper over the service `POST /api/m/v1/teams/:teamId/practice-prep` shares.
 */
export async function createPrepPracticeAction(input: CreatePrepInput): Promise<{ practiceId: string } | string> {
  const authClient = createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return 'Not authenticated — please log in again.';

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const result = await createPrepPracticeFromPlan(db, user.id, input);
  return result.ok ? result.data : result.error;
}
