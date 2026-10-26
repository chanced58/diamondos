import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { isCoachRole } from '@baseball/shared';

function serviceClient(): SupabaseClient | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey);
}

type RosterAccess = { canView: boolean; canManage: boolean };

/**
 * What a user may do with a team's roster, read with the given (service-role)
 * client.
 *
 * Managing it takes ANY of:
 *   1. platform admin
 *   2. a coach-level role on the team (head_coach, assistant_coach, athletic_director)
 *   3. league admin for any league that contains this team
 *
 * Viewing it takes managing it, or any active membership of the team (staff,
 * players and parents).
 */
export async function getRosterAccess(db: SupabaseClient, teamId: string, userId: string): Promise<RosterAccess> {
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

  const role = (membershipResult.data?.role as string | undefined) ?? null;
  const isMember = role !== null;

  // 1. Platform admin, 2. team coach
  if (profileResult.data?.is_platform_admin === true || isCoachRole(role ?? '')) {
    return { canView: true, canManage: true };
  }

  // 3. League admin for a league that contains this team
  const leagueIds = ((leagueAdminResult.data ?? []) as Array<{ league_id: string }>).map((r) => r.league_id);
  if (leagueIds.length > 0) {
    const { data: membership } = await db
      .from('league_members')
      .select('id')
      .eq('team_id', teamId)
      .eq('is_active', true)
      .in('league_id', leagueIds)
      .limit(1)
      .maybeSingle();

    if (membership) return { canView: true, canManage: true };
  }

  return { canView: isMember, canManage: false };
}

/** Whether a user can manage the roster for a given team (see `getRosterAccess`). */
export async function canManageRoster(teamId: string, userId: string): Promise<boolean> {
  const db = serviceClient();
  if (!db) return false;
  return (await getRosterAccess(db, teamId, userId)).canManage;
}

/** Whether a user can see a team's roster and its players (see `getRosterAccess`). */
export async function canViewRoster(teamId: string, userId: string): Promise<boolean> {
  const db = serviceClient();
  if (!db) return false;
  return (await getRosterAccess(db, teamId, userId)).canView;
}
