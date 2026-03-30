'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { isCoachRole, sendMessageSchema } from '@baseball/shared';

export async function postAnnouncementAction(
  _prevState: string | null | undefined,
  formData: FormData,
): Promise<string | null> {
  const authClient = createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return 'Not authenticated — please log in again.';

  const teamId    = formData.get('teamId') as string;
  const channelId = formData.get('channelId') as string;

  if (!teamId) return 'Missing team ID.';

  const parsed = sendMessageSchema.safeParse({
    body: (formData.get('body') as string)?.trim(),
  });
  if (!parsed.success) return parsed.error.issues[0].message;
  const { body } = parsed.data;

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Verify coach role
  const { data: membership } = await db
    .from('team_members')
    .select('role')
    .eq('team_id', teamId)
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle();

  if (!membership || !isCoachRole(membership.role)) {
    return 'Only coaches can post announcements.';
  }

  // Resolve and validate target channel
  let targetChannelId = channelId;
  if (targetChannelId) {
    // Verify supplied channelId belongs to this team and is an announcement channel
    const { data: channel } = await db
      .from('channels')
      .select('id')
      .eq('id', targetChannelId)
      .eq('team_id', teamId)
      .eq('channel_type', 'announcement')
      .maybeSingle();

    if (!channel) return 'Invalid announcement channel for this team.';
  } else {
    // Fall back to first announcement channel for the team
    const { data: channel } = await db
      .from('channels')
      .select('id')
      .eq('team_id', teamId)
      .eq('channel_type', 'announcement')
      .order('created_at')
      .limit(1)
      .maybeSingle();

    if (!channel) return 'No announcement channel found for this team.';
    targetChannelId = channel.id;
  }

  const { error } = await db
    .from('messages')
    .insert({ channel_id: targetChannelId, sender_id: user.id, body });

  if (error) return `Failed to post announcement: ${error.message}`;

  revalidatePath('/messages', 'layout');
  revalidatePath('/dashboard');
  return 'sent';
}
