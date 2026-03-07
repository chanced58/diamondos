'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';

const ROSTER_ADMIN_ROLES = ['head_coach', 'assistant_coach', 'athletic_director'] as const;

async function getAuthorizedCoach(teamId: string) {
  const authClient = createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated — please log in again.' };

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Platform admins can manage any team
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('is_platform_admin')
    .eq('id', user.id)
    .single();

  if (profile?.is_platform_admin) return { supabase, user };

  const { data: membership } = await supabase
    .from('team_members')
    .select('role')
    .eq('team_id', teamId)
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle();

  if (!membership || !ROSTER_ADMIN_ROLES.includes(membership.role as typeof ROSTER_ADMIN_ROLES[number])) {
    return { error: 'Only head coaches and athletic directors can manage team members.' };
  }

  return { supabase, user };
}

export async function updateMemberRoleAction(
  _prevState: string | null,
  formData: FormData,
): Promise<string | null> {
  const teamId = formData.get('teamId') as string;
  const result = await getAuthorizedCoach(teamId);
  if ('error' in result) return result.error;
  const { supabase } = result;

  const memberId = formData.get('memberId') as string;
  const newRole  = formData.get('role') as string;

  const { error } = await supabase
    .from('team_members')
    .update({ role: newRole })
    .eq('id', memberId)
    .eq('team_id', teamId);

  if (error) return `Failed to update role: ${error.message}`;

  revalidatePath(`/teams/${teamId}/admin/users`);
  return null;
}

export async function removeMemberAction(
  _prevState: string | null,
  formData: FormData,
): Promise<string | null> {
  const teamId = formData.get('teamId') as string;
  const result = await getAuthorizedCoach(teamId);
  if ('error' in result) return result.error;
  const { supabase } = result;

  const memberId = formData.get('memberId') as string;

  const { error } = await supabase
    .from('team_members')
    .update({ is_active: false })
    .eq('id', memberId)
    .eq('team_id', teamId);

  if (error) return `Failed to remove member: ${error.message}`;

  revalidatePath(`/teams/${teamId}/admin/users`);
  return null;
}

export async function cancelInvitationAction(
  _prevState: string | null,
  formData: FormData,
): Promise<string | null> {
  const teamId = formData.get('teamId') as string;
  const result = await getAuthorizedCoach(teamId);
  if ('error' in result) return result.error;
  const { supabase } = result;

  const invitationId = formData.get('invitationId') as string;

  const { error } = await supabase
    .from('team_invitations')
    .update({ status: 'cancelled' })
    .eq('id', invitationId)
    .eq('team_id', teamId);

  if (error) return `Failed to cancel invitation: ${error.message}`;

  revalidatePath(`/teams/${teamId}/admin/users`);
  return null;
}

export async function resendInvitationAction(
  _prevState: string | null,
  formData: FormData,
): Promise<string | null> {
  const teamId = formData.get('teamId') as string;
  const result = await getAuthorizedCoach(teamId);
  if ('error' in result) return result.error;
  const { supabase } = result;

  const invitationId = formData.get('invitationId') as string;
  const email = formData.get('email') as string;
  const role  = formData.get('role') as string;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? 'http://localhost:3000';
  const { error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email, {
    data: { invited_to_team: teamId, invited_role: role },
    redirectTo: `${appUrl}/auth/callback?team=${teamId}&role=${role}`,
  });

  if (inviteError) return `Failed to resend invite: ${inviteError.message}`;

  await supabase
    .from('team_invitations')
    .update({ invited_at: new Date().toISOString(), status: 'pending' })
    .eq('id', invitationId)
    .eq('team_id', teamId);

  revalidatePath(`/teams/${teamId}/admin/users`);
  return null;
}

export async function linkParentToPlayerAction(
  _prevState: string | null,
  formData: FormData,
): Promise<string | null> {
  const teamId = formData.get('teamId') as string;
  const result = await getAuthorizedCoach(teamId);
  if ('error' in result) return result.error;
  const { supabase } = result;

  const parentUserId = formData.get('parentUserId') as string;
  const playerId = formData.get('playerId') as string;

  const { error } = await supabase
    .from('parent_player_links')
    .upsert(
      { parent_user_id: parentUserId, player_id: playerId },
      { onConflict: 'parent_user_id,player_id', ignoreDuplicates: true },
    );

  if (error) return `Failed to link player: ${error.message}`;

  revalidatePath(`/teams/${teamId}/admin/users`);
  return null;
}

export async function unlinkParentFromPlayerAction(
  _prevState: string | null,
  formData: FormData,
): Promise<string | null> {
  const teamId = formData.get('teamId') as string;
  const result = await getAuthorizedCoach(teamId);
  if ('error' in result) return result.error;
  const { supabase } = result;

  const parentUserId = formData.get('parentUserId') as string;
  const playerId = formData.get('playerId') as string;

  const { error } = await supabase
    .from('parent_player_links')
    .delete()
    .eq('parent_user_id', parentUserId)
    .eq('player_id', playerId);

  if (error) return `Failed to unlink player: ${error.message}`;

  revalidatePath(`/teams/${teamId}/admin/users`);
  return null;
}

export async function resendPlayerInviteAction(
  _prevState: string | null,
  formData: FormData,
): Promise<string | null> {
  const teamId = formData.get('teamId') as string;
  const result = await getAuthorizedCoach(teamId);
  if ('error' in result) return result.error;
  const { supabase, user } = result;

  const playerId = formData.get('playerId') as string;

  const { data: player } = await supabase
    .from('players')
    .select('id, first_name, last_name, email')
    .eq('id', playerId)
    .eq('team_id', teamId)
    .single();

  if (!player?.email) return 'No email address on file for this player.';

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? 'http://localhost:3000';
  const { error } = await supabase.auth.admin.inviteUserByEmail(player.email, {
    data: { invited_as_player: playerId, invited_to_team: teamId, invited_role: 'player' },
    redirectTo: `${appUrl}/auth/callback?team=${teamId}&player=${playerId}&role=player`,
  });

  if (error) return `Failed to send invite: ${error.message}`;

  await supabase.from('team_invitations').upsert(
    {
      team_id: teamId,
      email: player.email,
      first_name: player.first_name,
      last_name: player.last_name,
      role: 'player',
      invited_by: user.id,
      status: 'pending',
      invited_at: new Date().toISOString(),
    },
    { onConflict: 'team_id,email' },
  );

  revalidatePath(`/teams/${teamId}/admin/users`);
  return 'invited';
}

export async function connectPlayerToAccountAction(
  _prevState: string | null,
  formData: FormData,
): Promise<string | null> {
  const teamId = formData.get('teamId') as string;
  const result = await getAuthorizedCoach(teamId);
  if ('error' in result) return result.error;
  const { supabase, user } = result;

  const playerId = formData.get('playerId') as string;
  const email = (formData.get('email') as string)?.toLowerCase().trim();

  if (!email) return 'Email is required.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Please enter a valid email address.';

  // Look up existing user by email (populated by migration 21 trigger)
  const { data: existingProfile } = await supabase
    .from('user_profiles')
    .select('id')
    .eq('email', email)
    .maybeSingle();

  if (existingProfile) {
    // User already registered — link directly
    const { error: playerError } = await supabase
      .from('players')
      .update({ user_id: existingProfile.id })
      .eq('id', playerId)
      .eq('team_id', teamId);
    if (playerError) return `Failed to link player: ${playerError.message}`;

    await supabase
      .from('team_members')
      .upsert(
        { team_id: teamId, user_id: existingProfile.id, role: 'player', is_active: true },
        { onConflict: 'team_id,user_id' },
      );

    revalidatePath(`/teams/${teamId}/admin/users`);
    return null;
  }

  // New user — send invite; callback will link the player record on acceptance
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? 'http://localhost:3000';
  const { error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email, {
    data: { invited_to_team: teamId, invited_role: 'player', invited_as_player: playerId },
    redirectTo: `${appUrl}/auth/callback?team=${teamId}&role=player&player=${playerId}`,
  });

  if (inviteError) return `Failed to send invite: ${inviteError.message}`;

  await supabase.from('team_invitations').upsert(
    {
      team_id: teamId,
      email,
      role: 'player',
      invited_by: user.id,
      status: 'pending',
    },
    { onConflict: 'team_id,email' },
  );

  revalidatePath(`/teams/${teamId}/admin/users`);
  return null;
}
