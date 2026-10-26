'use server';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { addToTeamChannels } from '@/lib/team-channels';

const STAFF_ROLES = ['head_coach', 'assistant_coach', 'athletic_director', 'scorekeeper', 'staff'] as const;
type StaffRole = typeof STAFF_ROLES[number];

/** Platform admins and the team's head coaches, assistants and athletic directors invite staff. */
async function canInviteStaff(supabase: SupabaseClient, teamId: string, userId: string): Promise<boolean> {
  const [{ data: adminProfile }, { data: membership }] = await Promise.all([
    supabase.from('user_profiles').select('is_platform_admin').eq('id', userId).maybeSingle(),
    supabase.from('team_members').select('role').eq('team_id', teamId).eq('user_id', userId).eq('is_active', true).maybeSingle(),
  ]);
  if (adminProfile?.is_platform_admin === true) return true;
  return Boolean(membership && ['head_coach', 'assistant_coach', 'athletic_director'].includes(membership.role));
}

/**
 * Look up whether an email belongs to an existing app user, for the staff
 * invite form. Returns their profile or null. Only for those who can invite
 * staff to the team: it tells whether an address has an account.
 */
export async function lookupUserByEmailAction(teamId: string, email: string): Promise<{
  id: string;
  firstName: string;
  lastName: string;
} | null> {
  const authClient = createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user || !teamId) return null;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  if (!(await canInviteStaff(supabase, teamId, user.id))) return null;

  // Try user_profiles first (fast)
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('id, first_name, last_name')
    .eq('email', email.toLowerCase().trim())
    .maybeSingle();

  if (profile) {
    return { id: profile.id, firstName: profile.first_name, lastName: profile.last_name };
  }

  // Fallback: user_profiles.email may be null — use RPC to check auth.users directly
  const { data: authId } = await supabase.rpc('find_auth_user_id_by_email', { p_email: email.toLowerCase().trim() });
  if (!authId) return null;

  // Fetch their profile by user ID
  const { data: profileById } = await supabase
    .from('user_profiles')
    .select('first_name, last_name')
    .eq('id', authId)
    .maybeSingle();

  return {
    id: authId,
    firstName: profileById?.first_name ?? '',
    lastName: profileById?.last_name ?? '',
  };
}

export async function inviteStaffAction(
  _prevState: string | null | undefined,
  formData: FormData,
): Promise<string | null> {
  const authClient = createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return 'Not authenticated — please log in again.';

  const teamId = formData.get('teamId') as string;
  const email = (formData.get('email') as string)?.toLowerCase().trim();
  const role = formData.get('role') as string;
  const firstName = (formData.get('firstName') as string)?.trim() || null;
  const lastName = (formData.get('lastName') as string)?.trim() || null;
  const phone = (formData.get('phone') as string)?.trim() || null;
  const jerseyRaw = (formData.get('jerseyNumber') as string)?.trim();
  const jerseyNumber = jerseyRaw ? parseInt(jerseyRaw, 10) : null;

  if (!teamId || !role) return 'All required fields are missing.';
  if (!STAFF_ROLES.includes(role as StaffRole)) return 'Invalid role selected.';
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return 'Please enter a valid email address.';
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  if (!(await canInviteStaff(supabase, teamId, user.id))) {
    return 'Only head coaches and athletic directors can invite staff members.';
  }

  // If no email provided, create a placeholder-only record (name/phone visible in roster)
  if (!email) {
    await supabase.from('team_invitations').upsert(
      {
        team_id: teamId,
        email: `noemail_${Date.now()}@placeholder.internal`,
        first_name: firstName,
        last_name: lastName,
        phone,
        role,
        jersey_number: jerseyNumber,
        invited_by: user.id,
        status: 'pending',
      },
      { onConflict: 'team_id,email' },
    );
    return 'added';
  }

  // Check if this email already belongs to a user via user_profiles
  const { data: existingProfile } = await supabase
    .from('user_profiles')
    .select('id, first_name, last_name')
    .eq('email', email)
    .maybeSingle();

  // Fallback: user_profiles.email may be null — use RPC to check auth.users directly
  let resolvedUserId: string | null = existingProfile?.id ?? null;
  if (!resolvedUserId) {
    const { data: authId } = await supabase.rpc('find_auth_user_id_by_email', { p_email: email });
    resolvedUserId = authId ?? null;
  }

  if (resolvedUserId) {
    // Refuse to add a platform admin to a team
    const { data: targetProfile } = await supabase
      .from('user_profiles')
      .select('is_platform_admin')
      .eq('id', resolvedUserId)
      .maybeSingle();

    if (targetProfile?.is_platform_admin) {
      return 'Platform administrators cannot be added to a team.';
    }

    // An invite never changes the role of someone already on the team.
    const { data: currentMembership, error: membershipError } = await supabase
      .from('team_members')
      .select('role, is_active')
      .eq('team_id', teamId)
      .eq('user_id', resolvedUserId)
      .maybeSingle();
    if (membershipError) {
      console.error(`[invite-staff] membership lookup failed team=${teamId}:`, membershipError.message);
      return 'Could not check their current membership. Please try again.';
    }
    if (currentMembership?.is_active && currentMembership.role !== role) {
      return 'They are already on this team with another role. Change their role from the team admin page instead.';
    }

    // User already has an account — add them to the team directly
    const { error: memberError } = await supabase
      .from('team_members')
      .upsert(
        { team_id: teamId, user_id: resolvedUserId, role, is_active: true, jersey_number: jerseyNumber },
        { onConflict: 'team_id,user_id' },
      );
    if (memberError) return `Failed to add member: ${memberError.message}`;

    // Backfill name and email on their profile if missing
    const profileFirstName = existingProfile?.first_name ?? '';
    const profileLastName = existingProfile?.last_name ?? '';
    const updates: Record<string, string | null> = { email };
    if ((!profileFirstName || !profileLastName) && (firstName || lastName)) {
      updates.first_name = profileFirstName || firstName;
      updates.last_name = profileLastName || lastName;
    }
    await supabase.from('user_profiles').update(updates).eq('id', resolvedUserId);

    // Add to all team channels
    await addToTeamChannels(supabase, teamId, resolvedUserId, role);

    // Record as accepted invitation
    await supabase.from('team_invitations').upsert(
      {
        team_id: teamId,
        email,
        first_name: firstName,
        last_name: lastName,
        phone,
        role,
        jersey_number: jerseyNumber,
        invited_by: user.id,
        status: 'accepted',
        accepted_at: new Date().toISOString(),
      },
      { onConflict: 'team_id,email' },
    );

    return 'added';
  }

  // New user — send a magic-link invite
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL;
  if (!appUrl) {
    return 'Server configuration error: APP_URL is not set. Please contact an administrator.';
  }
  const { error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email, {
    data: { invited_to_team: teamId, invited_role: role },
    redirectTo: `${appUrl}/auth/callback?team=${teamId}&role=${role}`,
  });

  if (inviteError) {
    if (inviteError.message.toLowerCase().includes('rate') || inviteError.status === 429) {
      return 'Email rate limit reached. Please wait a few minutes and try again.';
    }
    return `Failed to send invite: ${inviteError.message}`;
  }

  // Record pending invitation
  await supabase.from('team_invitations').upsert(
    {
      team_id: teamId,
      email,
      first_name: firstName,
      last_name: lastName,
      phone,
      role,
      jersey_number: jerseyNumber,
      invited_by: user.id,
      status: 'pending',
    },
    { onConflict: 'team_id,email' },
  );

  return 'invited';
}
