'use server';

import { createClient } from '@supabase/supabase-js';
import type { PersistedScoutingCard } from '@baseball/shared';
import { createServerClient } from '@/lib/supabase/server';
import { generateScoutingCard } from '@/lib/services/scouting/scouting-card';

/**
 * Generates a new scouting card — a thin wrapper over the service the mobile
 * `/api/m/v1/opponent-teams/:id/scouting-card` route shares. Returns the card,
 * or the message to show.
 */
export async function generateScoutingCardAction(
  opponentTeamId: string,
): Promise<PersistedScoutingCard | string> {
  const authClient = createServerClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) return 'Not authenticated — please log in again.';

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const result = await generateScoutingCard(db, user.id, { opponentTeamId });
  return result.ok ? result.data.card : result.error;
}
