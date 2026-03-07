import type { JSX } from 'react';
import { Metadata } from 'next';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { getTeamsForUser } from '@baseball/database';
import { seedDefaultChannels } from './seed';
import { NewAnnouncementForm } from './NewAnnouncementForm';

export const metadata: Metadata = { title: 'Messages' };

const CHANNEL_TYPE_LABELS: Record<string, string> = {
  announcement: 'Announcements',
  topic: 'Channels',
  direct: 'Direct Messages',
};

const CHANNEL_TYPE_ICONS: Record<string, string> = {
  announcement: '📢',
  topic: '#',
  direct: '💬',
};

export default async function MessagesPage(): Promise<JSX.Element | null> {
  const auth = createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return null;

  const teams = await getTeamsForUser(auth, user.id);
  const activeTeam = teams?.[0]?.teams as { id: string; name: string } | undefined;

  if (!activeTeam) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Messages</h1>
        <p className="text-gray-400 mt-16 text-center">No team found. Create or join a team first.</p>
      </div>
    );
  }

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: membership } = await db
    .from('team_members')
    .select('role')
    .eq('team_id', activeTeam.id)
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle();

  const isCoach =
    membership?.role === 'head_coach' ||
    membership?.role === 'assistant_coach' ||
    membership?.role === 'athletic_director';

  // Get channel IDs the user belongs to
  const { data: memberOf } = await db
    .from('channel_members')
    .select('channel_id, can_post, last_read_at')
    .eq('user_id', user.id);

  const channelIds = memberOf?.map((m) => m.channel_id) ?? [];

  // Fetch those channels with all member profiles (for DM display names)
  let channels: any[] = [];
  if (channelIds.length > 0) {
    const { data } = await db
      .from('channels')
      .select(`
        id, name, channel_type, description,
        channel_members(user_id, user_profiles(first_name, last_name))
      `)
      .eq('team_id', activeTeam.id)
      .in('id', channelIds)
      .order('name');
    channels = data ?? [];
  }

  // Seed defaults if first visit
  if (channels.length === 0) {
    await seedDefaultChannels(db, activeTeam.id, user.id);

    // Re-fetch after seeding
    const { data: freshMemberOf } = await db
      .from('channel_members')
      .select('channel_id')
      .eq('user_id', user.id);

    const freshIds = freshMemberOf?.map((m) => m.channel_id) ?? [];
    if (freshIds.length > 0) {
      const { data } = await db
        .from('channels')
        .select(`
          id, name, channel_type, description,
          channel_members(user_id, user_profiles(first_name, last_name))
        `)
        .eq('team_id', activeTeam.id)
        .in('id', freshIds)
        .order('name');
      channels = data ?? [];
    }
  }

  // Group channels
  const announcements = channels.filter((c) => c.channel_type === 'announcement');
  const topics = channels.filter((c) => c.channel_type === 'topic');
  const dms = channels.filter((c) => c.channel_type === 'direct');

  function getDmDisplayName(channel: any): string {
    const other = (channel.channel_members as any[]).find(
      (m: any) => m.user_id !== user!.id,
    );
    if (!other?.user_profiles) return 'Unknown';
    return `${other.user_profiles.first_name} ${other.user_profiles.last_name}`;
  }

  function ChannelList({ items, type }: { items: any[]; type: string }) {
    if (items.length === 0) return null;
    const icon = CHANNEL_TYPE_ICONS[type];
    return (
      <div className="mb-6">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 px-1">
          {CHANNEL_TYPE_LABELS[type]}
        </p>
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <ul className="divide-y divide-gray-100">
            {items.map((channel) => {
              const displayName =
                type === 'direct' ? getDmDisplayName(channel) : channel.name;
              return (
                <li key={channel.id}>
                  <Link
                    href={`/messages/${channel.id}`}
                    className="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors"
                  >
                    <span className="text-gray-400 font-mono text-sm w-5 text-center shrink-0">
                      {icon}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{displayName}</p>
                      {channel.description && type !== 'direct' && (
                        <p className="text-xs text-gray-400 truncate">{channel.description}</p>
                      )}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-2xl">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Messages</h1>
          <p className="text-gray-500 text-sm mt-0.5">{activeTeam.name}</p>
        </div>
        <div className="flex items-center gap-2">
          {isCoach && (
            <Link
              href="/messages/new"
              className="text-sm font-medium bg-brand-700 text-white px-3 py-2 rounded-lg hover:bg-brand-800 transition-colors"
            >
              + New Channel
            </Link>
          )}
          <Link
            href="/messages/dm/new"
            className="text-sm font-medium bg-white border border-gray-300 text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors"
          >
            + New DM
          </Link>
        </div>
      </div>

      {/* ── Channel lists ────────────────────────────────────────────── */}
      {/* Announcements section with compose form for coaches */}
      {announcements.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2 px-1">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
              {CHANNEL_TYPE_LABELS['announcement']}
            </p>
            {isCoach && (
              <NewAnnouncementForm
                teamId={activeTeam.id}
                channelId={announcements[0]?.id ?? ''}
              />
            )}
          </div>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <ul className="divide-y divide-gray-100">
              {announcements.map((channel) => (
                <li key={channel.id}>
                  <Link
                    href={`/messages/${channel.id}`}
                    className="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors"
                  >
                    <span className="text-gray-400 font-mono text-sm w-5 text-center shrink-0">
                      {CHANNEL_TYPE_ICONS['announcement']}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{channel.name}</p>
                      {channel.description && (
                        <p className="text-xs text-gray-400 truncate">{channel.description}</p>
                      )}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      <ChannelList items={topics} type="topic" />
      <ChannelList items={dms} type="direct" />

      {channels.length === 0 && (
        <div className="text-center py-16 text-gray-400 text-sm">
          No channels yet. Check back soon.
        </div>
      )}
    </div>
  );
}
