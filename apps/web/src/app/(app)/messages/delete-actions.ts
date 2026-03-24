'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';

const COACH_ROLES = ['head_coach', 'assistant_coach', 'athletic_director'];

/**
 * Delete a channel. Coaches/staff only. CASCADE removes channel_members and messages.
 * DM channels cannot be deleted.
 */
export async function deleteChannelAction(channelId: string): Promise<string | null> {
  const authClient = createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return 'Not authenticated.';

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Fetch channel to get team_id and type
  const { data: channel } = await db
    .from('channels')
    .select('team_id, channel_type')
    .eq('id', channelId)
    .single();

  if (!channel) return 'Channel not found.';
  if (channel.channel_type === 'direct') return 'DM channels cannot be deleted.';

  // Verify coach role
  const { data: membership } = await db
    .from('team_members')
    .select('role')
    .eq('team_id', channel.team_id)
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle();

  const isPlatformAdmin = await checkPlatformAdmin(db, user.id);

  if (!isPlatformAdmin && (!membership || !COACH_ROLES.includes(membership.role))) {
    return 'Only coaches can delete channels.';
  }

  const { error } = await db.from('channels').delete().eq('id', channelId);
  if (error) return `Failed to delete channel: ${error.message}`;

  revalidatePath('/messages', 'layout');
  return null;
}

/**
 * Soft-delete a message. Coaches can delete any message; users can delete their own.
 */
export async function deleteMessageAction(messageId: string): Promise<string | null> {
  const authClient = createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return 'Not authenticated.';

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Fetch message to check ownership and get channel/team context
  const { data: message } = await db
    .from('messages')
    .select('sender_id, channel_id')
    .eq('id', messageId)
    .is('deleted_at', null)
    .single();

  if (!message) return 'Message not found.';

  const isOwner = message.sender_id === user.id;

  if (!isOwner) {
    // Check if user is a coach on the channel's team
    const { data: channel } = await db
      .from('channels')
      .select('team_id')
      .eq('id', message.channel_id)
      .single();

    if (!channel) return 'Channel not found.';

    const { data: membership } = await db
      .from('team_members')
      .select('role')
      .eq('team_id', channel.team_id)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle();

    const isPlatformAdmin = await checkPlatformAdmin(db, user.id);

    if (!isPlatformAdmin && (!membership || !COACH_ROLES.includes(membership.role))) {
      return 'You can only delete your own messages.';
    }
  }

  const { error } = await db
    .from('messages')
    .update({ deleted_at: new Date().toISOString(), body: '' })
    .eq('id', messageId);

  if (error) return `Failed to delete message: ${error.message}`;

  revalidatePath('/messages', 'layout');
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function checkPlatformAdmin(db: any, userId: string): Promise<boolean> {
  const { data } = await db
    .from('user_profiles')
    .select('is_platform_admin')
    .eq('id', userId)
    .maybeSingle();
  return (data as { is_platform_admin?: boolean } | null)?.is_platform_admin === true;
}
