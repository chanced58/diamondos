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

/**
 * Throws if the user is not a head coach or athletic director on the team.
 * Used by actions that change structural fields (create / delete blocks,
 * reorder, reassign coaches, compose rosters).
 */
export async function assertHeadCoachOrAD(
  supabase: SupabaseClient,
  userId: string,
  teamId: string,
): Promise<void> {
  const check = await checkCoachOnTeam(supabase, userId, teamId);
  if (check.role !== 'head_coach' && check.role !== 'athletic_director') {
    throw new Error(
      'Only head coaches or athletic directors can perform this action.',
    );
  }
}

/**
 * Throws if the user cannot edit content fields on the given block — i.e. they
 * are not HC/AD on the team AND they are not the block's assigned coach. Used
 * by actions that change content fields (notes, status, actual duration,
 * field_spaces, title) on an existing block.
 *
 * Assumes `blockId` has already been verified to live within the expected
 * practice via the cross-scope guards in server-action callers.
 */
export async function assertCanEditBlock(
  supabase: SupabaseClient,
  userId: string,
  blockId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from('practice_blocks')
    .select('assigned_coach_id, practices!inner(team_id)')
    .eq('id', blockId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load block: ${error.message}`);
  if (!data) throw new Error('Block not found.');

  const assignedCoachId = (data as unknown as { assigned_coach_id: string | null })
    .assigned_coach_id;
  const teamId = (
    data as unknown as { practices: { team_id: string } | { team_id: string }[] }
  ).practices;
  const teamIdValue = Array.isArray(teamId) ? teamId[0]?.team_id : teamId?.team_id;
  if (!teamIdValue) throw new Error('Block has no associated team.');

  const check = await checkCoachOnTeam(supabase, userId, teamIdValue);
  if (!check.isCoach) {
    throw new Error('You are not a coach on this team.');
  }

  const isHcOrAd =
    check.role === 'head_coach' || check.role === 'athletic_director';
  if (isHcOrAd) return;

  // Assistant coach path — must be the assigned owner of this block.
  if (assignedCoachId !== userId) {
    throw new Error(
      'Only the block owner or a head coach can modify this block.',
    );
  }
}
