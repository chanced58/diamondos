import type { SupabaseClient } from '@supabase/supabase-js';
import { getLeagueForStaff } from '@baseball/database';
import { getActiveLeague } from '@/lib/active-league';
import { getActiveTeam } from '@/lib/active-team';
import { getLeagueAccess } from '@/lib/league-access';

export interface AdminLeague {
  id: string;
  name: string;
  isLeagueAdmin: boolean;
}

/**
 * The league a league-staff page works on. An explicit `?leagueId=` wins when
 * the user is on that league's staff (so staff of several leagues reach each
 * one); otherwise the active team's league, then the user's first staff seat —
 * the same order as the /league/admin page. Null when the user has no staff
 * seat in the resolved league.
 */
export async function resolveAdminLeague(
  supabase: Parameters<typeof getActiveTeam>[0],
  db: SupabaseClient,
  userId: string,
  requestedLeagueId?: string | null,
): Promise<AdminLeague | null> {
  let league: { id: string; name: string } | null = null;

  if (requestedLeagueId) {
    const { data } = await db.from('leagues').select('id, name').eq('id', requestedLeagueId).maybeSingle();
    league = (data as { id: string; name: string } | null) ?? null;
  } else {
    const activeTeam = await getActiveTeam(supabase, userId);
    league = activeTeam ? await getActiveLeague(activeTeam.id) : null;
    league ??= await getLeagueForStaff(db, userId);
  }
  if (!league) return null;

  const access = await getLeagueAccess(league.id, userId);
  if (!access.isLeagueStaff) return null;
  return { id: league.id, name: league.name, isLeagueAdmin: access.isLeagueAdmin };
}
