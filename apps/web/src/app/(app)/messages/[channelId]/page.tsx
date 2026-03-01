import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { MessageThread } from './MessageThread';

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
}) {
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
      id, name, channel_type, description,
      channel_members(user_id, user_profiles(first_name, last_name))
    `)
    .eq('id', params.channelId)
    .single();

  if (!channel) redirect('/messages');

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
  for (const m of channel.channel_members as any[]) {
    if (m.user_profiles) {
      memberProfiles[m.user_id] = {
        firstName: m.user_profiles.first_name,
        lastName:  m.user_profiles.last_name,
      };
    }
  }

  // Compute channel display name (DMs use the other participant's name)
  let displayName = channel.name ?? 'Conversation';
  if (channel.channel_type === 'direct') {
    const other = (channel.channel_members as any[]).find(
      (m: any) => m.user_id !== user.id,
    );
    if (other?.user_profiles) {
      displayName = `${other.user_profiles.first_name} ${other.user_profiles.last_name}`;
    }
  }

  const icon = CHANNEL_TYPE_ICONS[channel.channel_type] ?? '#';

  return (
    <div className="flex flex-col h-full">
      {/* ── Channel header ───────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-gray-200 bg-white px-6 py-4 flex items-center gap-3">
        <Link href="/messages" className="text-gray-400 hover:text-gray-600 transition-colors">
          ←
        </Link>
        <span className="text-gray-400 font-mono">{icon}</span>
        <div>
          <h1 className="text-base font-semibold text-gray-900">{displayName}</h1>
          {channel.description && (
            <p className="text-xs text-gray-400">{channel.description}</p>
          )}
        </div>
      </div>

      {/* ── Message thread (real-time) ───────────────────────────────── */}
      <MessageThread
        channelId={params.channelId}
        initialMessages={messages ?? []}
        canPost={myMembership.can_post}
        currentUserId={user.id}
        memberProfiles={memberProfiles}
      />
    </div>
  );
}
