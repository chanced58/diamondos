'use server';

import { revalidatePath } from 'next/cache';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { enterManualResult, loadManualResult } from '@/lib/services/league-games/manual-result';
import { createLeagueRosterPlayer } from '@/lib/services/league-games/placeholders';

// Thin wrappers over lib/services/league-games/manual-result, shared with the
// mobile /api/m/v1/league-games/:id/manual-result route.

const NOT_SIGNED_IN = 'Not authenticated — please log in again.';

async function withActor<T>(action: (db: SupabaseClient, userId: string) => Promise<T>): Promise<T | string> {
  const auth = createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NOT_SIGNED_IN;
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  return action(db, user.id);
}

/** Saves the result. Returns an error message, or null on success. */
export async function saveManualResultAction(input: unknown): Promise<string | null> {
  const outcome = await withActor((db, userId) => enterManualResult(db, userId, input));
  if (typeof outcome === 'string') return outcome;
  if (!outcome.ok) return outcome.error;
  revalidatePath('/league/admin');
  revalidatePath(`/league/admin/games/${outcome.data.leagueGameId}/result`);
  return null;
}

export type AddRosterPlayerOutcome = { error: string } | { playerId: string; name: string; jersey: number | null };

/** Adds a roster player for a batting line; allowed to whoever may enter the result. */
export async function addRosterPlayerAction(
  leagueGameId: string,
  teamId: string,
  firstName: string,
  lastName: string,
  jerseyNumber: number | null,
): Promise<AddRosterPlayerOutcome> {
  const outcome = await withActor(async (db, userId) => {
    const loaded = await loadManualResult(db, userId, { leagueGameId });
    if (!loaded.ok) return { error: loaded.error };
    if (!loaded.data.canEdit || !loaded.data.rosters.some((roster) => roster.teamId === teamId)) {
      return { error: 'You can not add players for this game.' };
    }
    const first = firstName.trim();
    const last = lastName.trim();
    if (!first || !last) return { error: 'Enter the player’s first and last name.' };
    const { data: game } = await db.from('league_games').select('league_id').eq('id', leagueGameId).maybeSingle();
    if (!game) return { error: 'Game not found.' };
    const created = await createLeagueRosterPlayer(db, {
      leagueId: (game as { league_id: string }).league_id,
      teamId,
      firstName: first,
      lastName: last,
      jerseyNumber: jerseyNumber ?? undefined,
    });
    if (!created.ok) return { error: created.error };
    return { playerId: created.data.playerId, name: `${first} ${last}`, jersey: jerseyNumber };
  });
  return typeof outcome === 'string' ? { error: outcome } : outcome;
}
