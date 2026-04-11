import { createClient } from '@supabase/supabase-js';
import { isCoachRole } from '@baseball/shared';

/**
 * Check if a user can manage the roster for a given team.
 *
 * Returns true if ANY of the following hold:
 *   1. User is a platform admin
 *   2. User has a coach-level role on the team (head_coach, assistant_coach, athletic_director)
 *   3. User is a league admin for any league that contains this team
 */
export async function canManageRoster(teamId: string, userId: string): Promise<boolean> {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return false;

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey);

  const [profileResult, membershipResult, leagueAdminResult] = await Promise.all([
    db
      .from('user_profiles')
      .select('is_platform_admin')
      .eq('id', userId)
      .maybeSingle(),
    db
      .from('team_members')
      .select('role')
      .eq('team_id', teamId)
      .eq('user_id', userId)
      .eq('is_active', true)
      .maybeSingle(),
    db
      .from('league_staff')
      .select('role, league_id')
      .eq('user_id', userId)
      .eq('is_active', true)
      .eq('role', 'league_admin'),
  ]);

  // 1. Platform admin
  if (profileResult.data?.is_platform_admin === true) return true;

  // 2. Team coach
  if (isCoachRole(membershipResult.data?.role ?? '')) return true;

  // 3. League admin for a league that contains this team
  const leagueIds = (leagueAdminResult.data ?? []).map((r) => r.league_id);
  if (leagueIds.length > 0) {
    const { data: membership } = await db
      .from('league_members')
      .select('id')
      .eq('team_id', teamId)
      .eq('is_active', true)
      .in('league_id', leagueIds)
      .limit(1)
      .maybeSingle();

    if (membership) return true;
  }

  return false;
}
