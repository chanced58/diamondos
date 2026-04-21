import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Service-role Supabase client for practice mutation paths. RLS is bypassed,
 * so every caller MUST have already validated the user and their role via
 * assertCoachOnTeam below (or the equivalent manual check).
 */
export function createPracticeServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set');
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export type CoachCheck = {
  isCoach: boolean;
  role: string | null;
};

export async function checkCoachOnTeam(
  supabase: SupabaseClient,
  userId: string,
  teamId: string,
): Promise<CoachCheck> {
  const { data, error } = await supabase
    .from('team_members')
    .select('role, is_active')
    .eq('team_id', teamId)
    .eq('user_id', userId)
    .maybeSingle();

  // Surface infra errors rather than silently denying — callers need to
  // distinguish "not authorized" from "database unreachable".
  if (error) throw new Error(`Failed to load team membership: ${error.message}`);

  if (!data || data.is_active === false) return { isCoach: false, role: null };
  const isCoach =
    data.role === 'head_coach' ||
    data.role === 'assistant_coach' ||
    data.role === 'athletic_director';
  return { isCoach, role: data.role };
}

/**
 * Throws a string error message (suitable for a useActionState form result) if
 * the authenticated user is not a coach on the team. Otherwise returns silently.
 */
export async function assertCoachOnTeam(
  supabase: SupabaseClient,
  userId: string,
  teamId: string,
): Promise<void> {
  const check = await checkCoachOnTeam(supabase, userId, teamId);
  if (!check.isCoach) {
    throw new Error('Only coaches on this team can perform this action.');
  }
}
