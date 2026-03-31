import { createClient } from '@supabase/supabase-js';
import { getLeagueForTeam } from '@baseball/database';
import type { LeagueSummary } from '@baseball/database';

/**
 * Resolves the league for the active team.
 * Returns null if the team is not in any league or if the service role key is unavailable.
 */
export async function getActiveLeague(
  teamId: string,
): Promise<LeagueSummary | null> {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return null;

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey);
  return getLeagueForTeam(db, teamId);
}
