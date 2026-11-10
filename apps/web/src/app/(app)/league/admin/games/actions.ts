'use server';

import { revalidatePath } from 'next/cache';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { cancelLeagueGame, createLeagueGame, updateLeagueGame } from '@/lib/services/league-games/league-games';
import type { ServiceResult } from '@/lib/services/result';

// Thin wrappers over lib/services/league-games/league-games, shared with the
// mobile /api/m/v1/league-admin/:leagueId/games route; each returns an error
// message or null.

async function run<T>(action: (db: SupabaseClient, userId: string) => Promise<ServiceResult<T>>): Promise<string | null> {
  const auth = createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return 'Not authenticated — please log in again.';

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const result = await action(db, user.id);
  if (!result.ok) return result.error;

  revalidatePath('/league/admin/games');
  return null;
}

export async function createLeagueGameAction(input: unknown): Promise<string | null> {
  return run((db, userId) => createLeagueGame(db, userId, input));
}

export async function updateLeagueGameAction(input: unknown): Promise<string | null> {
  return run((db, userId) => updateLeagueGame(db, userId, input));
}

export async function cancelLeagueGameAction(leagueGameId: string): Promise<string | null> {
  return run((db, userId) => cancelLeagueGame(db, userId, { leagueGameId }));
}
