import type { SupabaseClient } from '@supabase/supabase-js';
import { isCoachRole, isHeadCoachOrAdRole } from '@baseball/shared';
import { serviceError, serviceOk, type ServiceResult } from '../result';

/**
 * Who manages a team's members and invitations, as the web team admin Users
 * page decides: platform admins and the team's head coaches, assistants and
 * athletic directors. Returns the actor's own membership id (null for a
 * platform admin who isn't on the team) and whether they may manage the
 * leadership roles (`canManageLeadership`, see `refuseLeadershipChange`).
 * Anyone else not on the team learns nothing about it.
 */
export async function authorizeMemberManager(
  db: SupabaseClient,
  actorUserId: string,
  teamId: string,
): Promise<ServiceResult<{ ownMemberId: string | null; canManageLeadership: boolean }>> {
  const [profileResult, membershipResult] = await Promise.all([
    db.from('user_profiles').select('is_platform_admin').eq('id', actorUserId).maybeSingle(),
    db
      .from('team_members')
      .select('id, role')
      .eq('team_id', teamId)
      .eq('user_id', actorUserId)
      .eq('is_active', true)
      .maybeSingle(),
  ]);
  if (profileResult.error || membershipResult.error) {
    console.error(
      `[members] authorization lookup failed team=${teamId} actor=${actorUserId}:`,
      profileResult.error ?? membershipResult.error,
    );
    return serviceError('failed', 'Something went wrong. Please try again.');
  }

  const membership = membershipResult.data as { id: string; role: string } | null;
  if (profileResult.data?.is_platform_admin === true) {
    return serviceOk({ ownMemberId: membership?.id ?? null, canManageLeadership: true });
  }
  if (!membership) return serviceError('not_found', 'Team not found.');
  if (!isCoachRole(membership.role)) {
    return serviceError('forbidden', 'Only head coaches, assistants and athletic directors can manage team members.');
  }
  return serviceOk({ ownMemberId: membership.id, canManageLeadership: isHeadCoachOrAdRole(membership.role) });
}

/**
 * The head coach and athletic director roles are for head coaches, athletic
 * directors and platform admins to change, remove, grant or invite: when any
 * of `roles` (a member's or invitation's current role, a requested one) is
 * one, an actor without `canManageLeadership` is refused. Null when allowed.
 */
export function refuseLeadershipChange<T = never>(
  canManageLeadership: boolean,
  ...roles: Array<string | null | undefined>
): ServiceResult<T> | null {
  if (canManageLeadership || !roles.some((role) => isHeadCoachOrAdRole(role))) return null;
  return serviceError('forbidden', 'Only head coaches and athletic directors can manage the head coach and athletic director roles.');
}
