'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';

export async function startDmAction(formData: FormData) {
  const authClient = createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return 'Not authenticated — please log in again.';

  const teamId       = formData.get('teamId') as string;
  const targetUserId = formData.get('targetUserId') as string;

  if (!teamId || !targetUserId) return 'Missing required fields.';
  if (targetUserId === user.id)  return 'You cannot DM yourself.';

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Find existing DM channel between these two users for this team:
  // Get all direct channel IDs where the current user is a member
  const { data: myDmMemberships } = await db
    .from('channel_members')
    .select('channel_id, channels!inner(id, team_id, channel_type)')
    .eq('user_id', user.id)
    .eq('channels.channel_type', 'direct')
    .eq('channels.team_id', teamId);

  const candidateChannelIds =
    (myDmMemberships ?? []).map((m) => m.channel_id);

  if (candidateChannelIds.length > 0) {
    // Check if the target user is in any of those channels
    const { data: match } = await db
      .from('channel_members')
      .select('channel_id')
      .eq('user_id', targetUserId)
      .in('channel_id', candidateChannelIds)
      .limit(1)
      .single();

    if (match) {
      redirect(`/messages/${match.channel_id}`);
    }
  }

  // No existing DM — create one
  const { data: channel, error } = await db
    .from('channels')
    .insert({
      team_id:      teamId,
      channel_type: 'direct',
      name:         null,
      created_by:   user.id,
    })
    .select('id')
    .single();

  if (error) return `Failed to start conversation: ${error.message}`;

  await db.from('channel_members').insert([
    { channel_id: channel.id, user_id: user.id,       can_post: true },
    { channel_id: channel.id, user_id: targetUserId,  can_post: true },
  ]);

  redirect(`/messages/${channel.id}`);
}
