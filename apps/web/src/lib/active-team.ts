import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import { getTeamsForUser } from '@baseball/database';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface ActiveTeam {
  id: string;
  name: string;
  organization?: string | null;
  logo_url?: string | null;
  primary_color?: string | null;
  secondary_color?: string | null;
}

/**
 * Resolves the active team for the current user.
 *
 * Priority:
 * 1. `active-team-id` cookie (set by middleware when visiting /teams/[id]/*)
 * 2. First team from the user's team memberships
 *
 * Returns null if the user has no teams.
 */
export async function getActiveTeam(
  supabase: SupabaseClient,
  userId: string,
): Promise<ActiveTeam | null> {
  const teams = await getTeamsForUser(supabase, userId);
  let activeTeam = teams?.[0]?.teams as ActiveTeam | undefined;

  // Check if a specific team was selected via the cookie
  const cookieStore = cookies();
  const activeTeamId = cookieStore.get('active-team-id')?.value;

  if (activeTeamId && activeTeamId !== activeTeam?.id) {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (serviceRoleKey) {
      const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey);
      const { data: selectedTeam } = await db
        .from('teams')
        .select('id, name, organization, logo_url, primary_color, secondary_color')
        .eq('id', activeTeamId)
        .maybeSingle();
      if (selectedTeam) {
        activeTeam = selectedTeam;
      }
    }
  }

  return activeTeam ?? null;
}
