import { createClient } from '@supabase/supabase-js';

export type LeagueAccess = {
  isLeagueStaff: boolean;
  isLeagueAdmin: boolean;
  role: string | null;
};

/**
 * Check if a user has league staff access.
 */
export async function getLeagueAccess(
  leagueId: string,
  userId: string,
): Promise<LeagueAccess> {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return { isLeagueStaff: false, isLeagueAdmin: false, role: null };
  }

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey);

  const { data } = await db
    .from('league_staff')
    .select('role')
    .eq('league_id', leagueId)
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle();

  const role = data?.role ?? null;

  return {
    isLeagueStaff: role !== null,
    isLeagueAdmin: role === 'league_admin',
    role,
  };
}
