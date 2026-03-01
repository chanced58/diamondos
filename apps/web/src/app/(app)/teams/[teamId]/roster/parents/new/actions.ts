'use server';

import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { addToTeamChannels } from '@/lib/team-channels';

export async function inviteParentAction(
  _prevState: string | null,
  formData: FormData,
): Promise<string | null> {
  const authClient = createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return 'Not authenticated — please log in again.';

  const teamId = formData.get('teamId') as string;
  const rawEmail = (formData.get('email') as string)?.toLowerCase().trim();
  const email = rawEmail || null;
  const firstName = (formData.get('firstName') as string)?.trim() || null;
  const lastName = (formData.get('lastName') as string)?.trim() || null;
  const phone = (formData.get('phone') as string)?.trim() || null;
  const linkedPlayerIds = formData.getAll('playerIds') as string[];

  if (!teamId) return 'Team is required.';
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return 'Please enter a valid email address.';
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Only head coaches and athletic directors can add parents
  const { data: membership } = await supabase
    .from('team_members')
    .select('role')
    .eq('team_id', teamId)
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle();

  if (!membership || !['head_coach', 'assistant_coach', 'athletic_director'].includes(membership.role)) {
    return 'Only head coaches and athletic directors can add parents.';
  }

  // No email provided — placeholder record only (can't create parent_player_links without a user account)
  if (!email) {
    await supabase.from('team_invitations').insert({
      team_id: teamId,
      email: `noemail_${Date.now()}@placeholder.internal`,
      first_name: firstName,
      last_name: lastName,
      phone,
      role: 'parent',
      invited_by: user.id,
      status: 'pending',
    });
    return 'added';
  }

  // Look up existing user by email (user_profiles.email is populated by migration 21 trigger)
  const { data: existingProfile } = await supabase
    .from('user_profiles')
    .select('id')
    .eq('email', email)
    .maybeSingle();

  if (existingProfile) {
    // User already has an account — add them to the team directly
    const { error: memberError } = await supabase
      .from('team_members')
      .upsert(
        { team_id: teamId, user_id: existingProfile.id, role: 'parent', is_active: true },
        { onConflict: 'team_id,user_id' },
      );
    if (memberError) return `Failed to add parent: ${memberError.message}`;

    // Create parent-player links for the selected players
    for (const playerId of linkedPlayerIds) {
      await supabase.from('parent_player_links').upsert(
        { parent_user_id: existingProfile.id, player_id: playerId },
        { onConflict: 'parent_user_id,player_id', ignoreDuplicates: true },
      );
    }

    await addToTeamChannels(supabase, teamId, existingProfile.id, 'parent');

    await supabase.from('team_invitations').upsert(
      {
        team_id: teamId,
        email,
        first_name: firstName,
        last_name: lastName,
        phone,
        role: 'parent',
        invited_by: user.id,
        status: 'accepted',
        accepted_at: new Date().toISOString(),
      },
      { onConflict: 'team_id,email' },
    );

    return 'added';
  }

  // New user — send magic-link invite; pass selected player IDs in the redirectTo URL
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? 'http://localhost:3000';
  const playersParam = linkedPlayerIds.length > 0 ? `&players=${linkedPlayerIds.join(',')}` : '';
  const { error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email, {
    data: { invited_to_team: teamId, invited_role: 'parent' },
    redirectTo: `${appUrl}/auth/callback?team=${teamId}&role=parent${playersParam}`,
  });

  if (inviteError) return `Failed to send invite: ${inviteError.message}`;

  await supabase.from('team_invitations').upsert(
    {
      team_id: teamId,
      email,
      first_name: firstName,
      last_name: lastName,
      phone,
      role: 'parent',
      invited_by: user.id,
      status: 'pending',
    },
    { onConflict: 'team_id,email' },
  );

  return 'invited';
}
