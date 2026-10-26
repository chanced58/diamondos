import type { SupabaseClient } from '@supabase/supabase-js';
import { isCoachRole } from '@baseball/shared';
import { serviceError, serviceOk, type ServiceResult } from '../result';

/**
 * Who manages a team's members and invitations, as the web team admin Users
 * page decides: platform admins and the team's head coaches, assistants and
 * athletic directors. Returns the actor's own membership id (null for a
 * platform admin who isn't on the team). Anyone else not on the team learns
 * nothing about it.
 */
export async function authorizeMemberManager(
  db: SupabaseClient,
  actorUserId: string,
  teamId: string,
): Promise<ServiceResult<{ ownMemberId: string | null }>> {
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
  if (profileResult.data?.is_platform_admin === true) return serviceOk({ ownMemberId: membership?.id ?? null });
  if (!membership) return serviceError('not_found', 'Team not found.');
  if (!isCoachRole(membership.role)) {
    return serviceError('forbidden', 'Only head coaches, assistants and athletic directors can manage team members.');
  }
  return serviceOk({ ownMemberId: membership.id });
}
