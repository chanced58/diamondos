'use server';

import { createClient } from '@supabase/supabase-js';
import type { AiPracticePlan, AiPracticePreviewResponse, PracticeFieldSpace } from '@baseball/shared';
import { createServerClient } from '@/lib/supabase/server';
import { createPracticeFromAiPlan, previewAiPractice } from '@/lib/services/practices/ai-practice';

/**
 * The Generate with AI page's two steps, thin wrappers over the services the
 * mobile routes share (`/api/m/v1/teams/:teamId/practices/ai-preview` and `/ai`).
 */

export interface GenerateInput {
  teamId: string;
  coachPrompt: string;
  durationMinutes: number;
  playerCount: number;
  availableFieldSpaces: PracticeFieldSpace[];
}

export type GenerateSuccess = AiPracticePreviewResponse;

async function authenticate() {
  const authClient = createServerClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) return null;
  return { user, db: createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!) };
}

/** Drafts a practice from the coach's description; nothing is saved. */
export async function generateAiPracticeAction(input: GenerateInput): Promise<GenerateSuccess | string> {
  const session = await authenticate();
  if (!session) return 'Not authenticated — please log in again.';

  const result = await previewAiPractice(session.db, session.user.id, input);
  return result.ok ? result.data : result.error;
}

export interface CreateFromPlanInput {
  teamId: string;
  scheduledAt: string;
  durationMinutes: number;
  plan: AiPracticePlan;
}

/** Saves the previewed plan as a practice. */
export async function createPracticeFromAiPlanAction(input: CreateFromPlanInput): Promise<{ practiceId: string } | string> {
  const session = await authenticate();
  if (!session) return 'Not authenticated — please log in again.';

  const result = await createPracticeFromAiPlan(session.db, session.user.id, input);
  return result.ok ? result.data : result.error;
}
