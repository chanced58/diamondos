'use server';

import { createClient } from '@supabase/supabase-js';
import type { PersistedPracticeSummary } from '@baseball/shared';
import { createServerClient } from '@/lib/supabase/server';
import { generatePracticeSummary, loadPracticeSummary } from '@/lib/services/practices/practice-summary';

/**
 * The practice page's AI summary, thin wrappers over the services
 * `/api/m/v1/practices/:id/summary` shares. Coaches only.
 */

async function authenticate() {
  const authClient = createServerClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) return null;
  return { user, db: createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!) };
}

/** Generates (or regenerates) the summary. */
export async function generatePracticeSummaryAction(practiceId: string): Promise<PersistedPracticeSummary | string> {
  const session = await authenticate();
  if (!session) return 'Not authenticated — please log in again.';

  const result = await generatePracticeSummary(session.db, session.user.id, { practiceId });
  if (!result.ok) return result.error;
  return result.data.summary ?? 'AI summary failed.';
}

/** The saved summary, or null before one is generated. */
export async function loadPracticeSummaryAction(practiceId: string): Promise<PersistedPracticeSummary | null | string> {
  const session = await authenticate();
  if (!session) return 'Not authenticated.';

  const result = await loadPracticeSummary(session.db, session.user.id, { practiceId });
  if (!result.ok) return result.code === 'not_found' ? null : result.error;
  return result.data.summary;
}
