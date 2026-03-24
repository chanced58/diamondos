import type { JSX } from 'react';
import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { getUserAccess } from '@/lib/user-access';
import { MessageThread } from './MessageThread';
import { DeleteChannelButton } from './DeleteChannelButton';

type MessageRow = {
  id: string;
  body: string;
  sender_id: string;
  created_at: string;
  edited_at: string | null;
  is_pinned: boolean;
  user_profiles: { first_name: string; last_name: string } | null;
};

export const metadata: Metadata = { title: 'Channel' };

const CHANNEL_TYPE_ICONS: Record<string, string> = {
  announcement: '📢',
  topic: '#',
  direct: '💬',
};

export default async function ChannelPage({
  params,
}: {
  params: { channelId: string };
}): Promise<JSX.Element | null> {
  const auth = createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return null;

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Verify user is a member of this channel
  const { data: myMembership } = await db
    .from('channel_members')
    .select('can_post')
    .eq('channel_id', params.channelId)
    .eq('user_id', user.id)
    .single();

  if (!myMembership) redirect('/messages');

  // Fetch channel info + all member profiles (for Realtime sender lookup)
  const { data: channel } = await db
    .from('channels')
    .select(`
      id, name, channel_type, description, team_id,
      channel_members(user_id, user_profiles(first_name, last_name))
    `)
    .eq('id', params.channelId)
    .single();

  if (!channel) redirect('/messages');

  const { isCoach } = await getUserAccess(channel.team_id, user.id);

  // Fetch initial 50 messages (oldest first) with sender profiles
  const { data: messages } = await db
    .from('messages')
    .select(`
      id, body, sender_id, created_at, edited_at, is_pinned,
      user_profiles(first_name, last_name)
    `)
    .eq('channel_id', params.channelId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(50);

  // Mark channel as read
  await db
    .from('channel_members')
    .update({ last_read_at: new Date().toISOString() })
    .eq('channel_id', params.channelId)
    .eq('user_id', user.id);

  // Build member profiles map for Realtime incoming messages
  const memberProfiles: Record<string, { firstName: string; lastName: string }> = {};
  for (const m of channel.channel_members) {
    const profile = m.user_profiles as unknown as { first_name: string; last_name: string } | null;
    if (profile) {
      memberProfiles[m.user_id] = {
        firstName: profile.first_name,
        lastName:  profile.last_name,
      };
    }
  }

  // Compute channel display name (DMs use the other participant's name)
  let displayName = channel.name ?? 'Conversation';
  if (channel.channel_type === 'direct') {
    const other = channel.channel_members.find(
      (m) => m.user_id !== user.id,
    );
    const otherProfile = other?.user_profiles as unknown as { first_name: string; last_name: string } | null;
    if (otherProfile) {
      displayName = `${otherProfile.first_name} ${otherProfile.last_name}`;
    }
  }

  const icon = CHANNEL_TYPE_ICONS[channel.channel_type] ?? '#';
  const canDeleteChannel = isCoach && channel.channel_type !== 'direct';

  return (
    <div className="flex flex-col h-full">
      {/* ── Channel header ───────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-gray-200 bg-white px-6 py-4 flex items-center gap-3">
        <span className="text-gray-400 font-mono">{icon}</span>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-semibold text-gray-900">{displayName}</h1>
          {channel.description && (
            <p className="text-xs text-gray-400">{channel.description}</p>
          )}
        </div>
        {canDeleteChannel && (
          <DeleteChannelButton channelId={params.channelId} channelName={displayName} />
        )}
      </div>

      {/* ── Message thread (real-time) ───────────────────────────────── */}
      <MessageThread
        channelId={params.channelId}
        channelType={channel.channel_type}
        initialMessages={(messages ?? []).map((m): MessageRow => ({
          id: m.id,
          body: m.body,
          sender_id: m.sender_id,
          created_at: m.created_at,
          edited_at: m.edited_at,
          is_pinned: m.is_pinned,
          user_profiles: Array.isArray(m.user_profiles) ? (m.user_profiles[0] ?? null) : (m.user_profiles ?? null),
        }))}
        canPost={myMembership.can_post}
        currentUserId={user.id}
        memberProfiles={memberProfiles}
        isCoach={isCoach}
      />
    </div>
  );
}
