import { createClient } from '@supabase/supabase-js';
import { isCoachRole } from '@baseball/shared';

export type UserAccess = {
  isCoach: boolean;
  isPlatformAdmin: boolean;
  role: string | null;
};

/**
 * Check if a user has coach-level access to a team.
 *
 * Platform admins always have full coach access to every team
 * without needing a team_members row.
 */
export async function getUserAccess(
  teamId: string,
  userId: string,
): Promise<UserAccess> {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return { isCoach: false, isPlatformAdmin: false, role: null };
  }

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey);

  const [profileResult, membershipResult] = await Promise.all([
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
  ]);

  const isPlatformAdmin = profileResult.data?.is_platform_admin === true;
  const role = membershipResult.data?.role ?? null;
  const isCoach = isPlatformAdmin || isCoachRole(role ?? '');

  return { isCoach, isPlatformAdmin, role };
}
