'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { resolvePlaceholder } from '@/lib/services/league-games/placeholders';

export type PlaceholderChoice =
  | { action: 'link'; playerId: string }
  | { action: 'create'; firstName: string; lastName: string; jerseyNumber?: number }
  | { action: 'fill_in' };

/** Matches an unknown player after a league game; returns an error message or null. Thin wrapper over the service the mobile route also calls. */
export async function resolvePlaceholderAction(placeholderId: string, choice: PlaceholderChoice): Promise<string | null> {
  const auth = createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return 'Not authenticated — please log in again.';

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const result = await resolvePlaceholder(db, user.id, { ...choice, placeholderId });
  if (!result.ok) return result.error;

  revalidatePath('/games');
  revalidatePath('/league/admin/games/unmatched');
  return null;
}
