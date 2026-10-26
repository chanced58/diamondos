import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { isCoachRole } from '@baseball/shared';

function serviceClient(): SupabaseClient | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey);
}

/** `role` is the user's active role on the team, if any. */
export type RosterAccess ={ canView: boolean; canManage: boolean; role: string | null };

/** Team staff who see every player's page without managing the roster. */
const STAFF_VIEWER_ROLES = ['scorekeeper', 'staff'];

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
    return { canView: true, canManage: true, role };
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

    if (membership) return { canView: true, canManage: true, role };
  }

  return { canView: isMember, canManage: false, role };
}

/** Whether roster access opens every player's page: roster managers and team staff. */
export function seesEveryPlayer(access: RosterAccess): boolean {
  return access.canManage || (access.role !== null && STAFF_VIEWER_ROLES.includes(access.role));
}

/**
 * What a user may do with one player's page, which shows contact details and
 * coaches' development notes. Roster managers and team staff see every
 * player; a player sees their own page and a parent their linked children's.
 * Other team members see the roster list only.
 */
export async function getPlayerAccess(
  db: SupabaseClient,
  teamId: string,
  playerId: string,
  userId: string,
): Promise<RosterAccess> {
  const access = await getRosterAccess(db, teamId, userId);
  if (!access.canView || seesEveryPlayer(access)) return access;

  // Both scoped to the team, so a link to a child on another team opens nothing here.
  const [ownResult, linkResult] = await Promise.all([
    db.from('players').select('id').eq('id', playerId).eq('team_id', teamId).eq('user_id', userId).maybeSingle(),
    db
      .from('parent_player_links')
      .select('player_id, players!inner(team_id)')
      .eq('player_id', playerId)
      .eq('parent_user_id', userId)
      .eq('players.team_id', teamId)
      .maybeSingle(),
  ]);
  return { ...access, canView: Boolean(ownResult.data || linkResult.data) };
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
