'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';

const COACH_ROLES = ['head_coach', 'assistant_coach', 'athletic_director'];

export async function postAnnouncementAction(
  _prevState: string | null | undefined,
  formData: FormData,
): Promise<string | null> {
  const authClient = createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return 'Not authenticated — please log in again.';

  const teamId  = formData.get('teamId') as string;
  const body    = (formData.get('body') as string)?.trim();
  const channelId = formData.get('channelId') as string;

  if (!teamId || !body) return 'Message body is required.';

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

  if (!membership || !COACH_ROLES.includes(membership.role)) {
    return 'Only coaches can post announcements.';
  }

  // Resolve target channel — use provided channelId or fall back to first announcement channel
  let targetChannelId = channelId;
  if (!targetChannelId) {
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
