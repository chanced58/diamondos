'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';

async function requirePlatformAdmin() {
  const authClient = createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated — please log in again.' };

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('is_platform_admin')
    .eq('id', user.id)
    .single();

  if (!profile?.is_platform_admin) {
    return { error: 'Only platform admins can perform this action.' };
  }

  return { supabase, user };
}

export async function updateUserProfileAction(
  _prevState: string | null | undefined,
  formData: FormData,
): Promise<string | null> {
  const result = await requirePlatformAdmin();
  if ('error' in result) return result.error ?? null;
  const { supabase } = result;

  const userId = formData.get('userId') as string;
  const firstName = (formData.get('firstName') as string)?.trim() ?? '';
  const lastName = (formData.get('lastName') as string)?.trim() ?? '';
  const email = (formData.get('email') as string)?.trim() || null;
  const phone = (formData.get('phone') as string)?.trim() || null;

  const { error } = await supabase
    .from('user_profiles')
    .update({ first_name: firstName, last_name: lastName, email, phone })
    .eq('id', userId);

  if (error) return `Failed to update profile: ${error.message}`;

  revalidatePath('/admin/users');
  return null;
}

export async function togglePlatformAdminAction(
  _prevState: string | null | undefined,
  formData: FormData,
): Promise<string | null> {
  const result = await requirePlatformAdmin();
  if ('error' in result) return result.error ?? null;
  const { supabase, user } = result;

  const userId = formData.get('userId') as string;

  // Prevent removing your own admin access
  if (userId === user.id) {
    return 'You cannot remove your own platform admin access.';
  }

  const currentValue = formData.get('currentValue') === 'true';

  const { error } = await supabase
    .from('user_profiles')
    .update({ is_platform_admin: !currentValue })
    .eq('id', userId);

  if (error) return `Failed to update admin status: ${error.message}`;

  revalidatePath('/admin/users');
  return null;
}

export async function removeFromTeamAction(
  _prevState: string | null | undefined,
  formData: FormData,
): Promise<string | null> {
  const result = await requirePlatformAdmin();
  if ('error' in result) return result.error ?? null;
  const { supabase } = result;

  const userId = formData.get('userId') as string;
  const teamId = formData.get('teamId') as string;

  const { error } = await supabase
    .from('team_members')
    .update({ is_active: false })
    .eq('user_id', userId)
    .eq('team_id', teamId);

  if (error) return `Failed to remove from team: ${error.message}`;

  revalidatePath('/admin/users');
  return null;
}

export async function deleteUserAction(
  _prevState: string | null | undefined,
  formData: FormData,
): Promise<string | null> {
  const result = await requirePlatformAdmin();
  if ('error' in result) return result.error ?? null;
  const { supabase, user } = result;

  const userId = formData.get('userId') as string;

  if (userId === user.id) {
    return 'You cannot delete your own account.';
  }

  // Nullify all RESTRICT FK references so auth.users deletion isn't blocked
  const nullifyResults = await Promise.all([
    supabase.from('teams').update({ created_by: null }).eq('created_by', userId),
    supabase.from('games').update({ created_by: null }).eq('created_by', userId),
    supabase.from('game_events').update({ created_by: null }).eq('created_by', userId),
    supabase.from('channels').update({ created_by: null }).eq('created_by', userId),
    supabase.from('messages').update({ sender_id: null }).eq('sender_id', userId),
    supabase.from('team_invitations').update({ invited_by: null }).eq('invited_by', userId),
    supabase.from('practices').update({ created_by: null }).eq('created_by', userId),
    supabase.from('practice_notes').update({ updated_by: null }).eq('updated_by', userId),
    supabase.from('practice_player_notes').update({ updated_by: null }).eq('updated_by', userId),
    supabase.from('team_events').update({ created_by: null }).eq('created_by', userId),
  ]);

  const nullifyError = nullifyResults.find((r) => r.error)?.error;
  if (nullifyError) {
    return `Failed to prepare user for deletion: ${nullifyError.message}`;
  }

  // Delete the auth user — cascades to user_profiles, team_members, channel_members, etc.
  // NOTE: Do NOT deactivate team_members before this — if deleteUser fails, the user
  // would be left with deactivated memberships (invisible on roster). The CASCADE on
  // auth.users will clean up team_members automatically on success.
  const { error } = await supabase.auth.admin.deleteUser(userId);

  if (error) return `Failed to delete user: ${error.message}`;

  revalidatePath('/admin/users');
  return null;
}
