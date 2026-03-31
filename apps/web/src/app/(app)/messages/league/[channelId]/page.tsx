import type { JSX } from 'react';
import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { LeagueMessageThread } from './LeagueMessageThread';

type MessageRow = {
  id: string;
  body: string;
  sender_id: string;
  created_at: string;
  edited_at: string | null;
  is_pinned: boolean;
  user_profiles: { first_name: string; last_name: string } | null;
};

export const metadata: Metadata = { title: 'League Channel' };

const CHANNEL_TYPE_ICONS: Record<string, string> = {
  announcement: '📢',
  topic: '#',
  direct: '💬',
};

export default async function LeagueChannelPage({
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

  // Verify user is a member of this league channel
  const { data: myMembership } = await db
    .from('league_channel_members')
    .select('can_post')
    .eq('league_channel_id', params.channelId)
    .eq('user_id', user.id)
    .single();

  if (!myMembership) redirect('/messages');

  // Fetch channel info + all member profiles
  const { data: channel } = await db
    .from('league_channels')
    .select('id, name, channel_type, description, league_id')
    .eq('id', params.channelId)
    .single();

  if (!channel) redirect('/messages');

  // Fetch member profiles for Realtime sender lookup
  const { data: channelMembers } = await db
    .from('league_channel_members')
    .select('user_id, user_profiles(first_name, last_name)')
    .eq('league_channel_id', params.channelId);

  // Fetch most recent 50 messages (descending) then reverse for oldest→newest display
  const { data: messagesDesc, error: messagesError } = await db
    .from('league_messages')
    .select(`
      id, body, sender_id, created_at, edited_at, is_pinned,
      user_profiles(first_name, last_name)
    `)
    .eq('league_channel_id', params.channelId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(50);

  if (messagesError) {
    console.error(`Failed to fetch messages for league channel ${params.channelId}:`, messagesError);
    redirect('/messages');
  }
  const messages = (messagesDesc ?? []).reverse();

  // Mark channel as read
  await db
    .from('league_channel_members')
    .update({ last_read_at: new Date().toISOString() })
    .eq('league_channel_id', params.channelId)
    .eq('user_id', user.id);

  // Build member profiles map (normalize array vs object shape from PostgREST)
  const memberProfiles: Record<string, { firstName: string; lastName: string }> = {};
  for (const m of channelMembers ?? []) {
    const raw = m.user_profiles;
    const profile = (Array.isArray(raw) ? raw[0] : raw) as { first_name: string; last_name: string } | null;
    if (profile) {
      memberProfiles[m.user_id] = {
        firstName: profile.first_name,
        lastName: profile.last_name,
      };
    }
  }

  const displayName = channel.name ?? 'League Channel';
  const icon = CHANNEL_TYPE_ICONS[channel.channel_type] ?? '🏆';

  return (
    <div className="flex flex-col h-full">
      {/* Channel header */}
      <div className="shrink-0 border-b border-gray-200 bg-white px-6 py-4 flex items-center gap-3">
        <span className="text-gray-400 font-mono">{icon}</span>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-semibold text-gray-900">{displayName}</h1>
          {channel.description && (
            <p className="text-xs text-gray-400">{channel.description}</p>
          )}
        </div>
        <span className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
          League
        </span>
      </div>

      {/* Message thread */}
      <LeagueMessageThread
        key={params.channelId}
        channelId={params.channelId}
        channelType={channel.channel_type}
        initialMessages={messages.map((m): MessageRow => ({
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
      />
    </div>
  );
}
