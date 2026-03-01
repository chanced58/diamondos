'use server';

import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { addToTeamChannels } from '@/lib/team-channels';

const STAFF_ROLES = ['head_coach', 'assistant_coach', 'athletic_director', 'scorekeeper', 'staff'] as const;
type StaffRole = typeof STAFF_ROLES[number];

export async function inviteStaffAction(
  _prevState: string | null,
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

  if (!teamId || !role) return 'All required fields are missing.';
  if (!STAFF_ROLES.includes(role as StaffRole)) return 'Invalid role selected.';
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return 'Please enter a valid email address.';
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Only head coaches and athletic directors can invite staff
  const { data: membership } = await supabase
    .from('team_members')
    .select('role')
    .eq('team_id', teamId)
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle();

  if (!membership || !['head_coach', 'assistant_coach', 'athletic_director'].includes(membership.role)) {
    return 'Only head coaches and athletic directors can invite staff members.';
  }

  // If no email provided, create a placeholder-only record (name/phone visible in roster)
  if (!email) {
    // Store the invitation record in pending state without sending an invite
    await supabase.from('team_invitations').upsert(
      {
        team_id: teamId,
        email: `noemail_${Date.now()}@placeholder.internal`,
        first_name: firstName,
        last_name: lastName,
        phone,
        role,
        invited_by: user.id,
        status: 'pending',
      },
      { onConflict: 'team_id,email' },
    );
    return 'added';
  }

  // Check if this email already belongs to a user in the system
  const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
  if (listError) return `Failed to look up users: ${listError.message}`;

  const existingUser = users.find((u) => u.email === email);

  if (existingUser) {
    // Already has an account — add them to the team directly
    const { error: memberError } = await supabase
      .from('team_members')
      .upsert(
        { team_id: teamId, user_id: existingUser.id, role, is_active: true },
        { onConflict: 'team_id,user_id' },
      );
    if (memberError) return `Failed to add member: ${memberError.message}`;

    // Add to all team channels
    await addToTeamChannels(supabase, teamId, existingUser.id, role);

    // Record the accepted invitation
    await supabase.from('team_invitations').upsert(
      {
        team_id: teamId,
        email,
        first_name: firstName,
        last_name: lastName,
        phone,
        role,
        invited_by: user.id,
        status: 'accepted',
        accepted_at: new Date().toISOString(),
      },
      { onConflict: 'team_id,email' },
    );

    return 'added';
  }

  // New user — send a magic-link invite
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? 'http://localhost:3000';
  const { error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email, {
    data: { invited_to_team: teamId, invited_role: role },
    redirectTo: `${appUrl}/auth/callback?team=${teamId}&role=${role}`,
  });

  if (inviteError) return `Failed to send invite: ${inviteError.message}`;

  // Record pending invitation
  await supabase.from('team_invitations').upsert(
    {
      team_id: teamId,
      email,
      first_name: firstName,
      last_name: lastName,
      phone,
      role,
      invited_by: user.id,
      status: 'pending',
    },
    { onConflict: 'team_id,email' },
  );

  return 'invited';
}
