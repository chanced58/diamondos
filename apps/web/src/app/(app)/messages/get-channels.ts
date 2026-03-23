import 'server-only';

import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { getActiveTeam } from '@/lib/active-team';
import { getUserAccess } from '@/lib/user-access';
import { seedDefaultChannels } from './seed';

export type SidebarChannel = {
  id: string;
  name: string;
  channel_type: string;
  description: string | null;
  channel_members: { user_id: string; user_profiles: { first_name: string; last_name: string } | null }[];
};

export type ChannelSidebarData = {
  announcements: SidebarChannel[];
  topics: SidebarChannel[];
  dms: SidebarChannel[];
  isCoach: boolean;
  teamId: string;
  teamName: string;
  userId: string;
};

export async function getChannelSidebarData(): Promise<ChannelSidebarData | null> {
  const auth = createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return null;

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Use service-role client for team resolution to bypass RLS —
  // the auth client can fail in standalone deployments when session
  // cookies aren't forwarded correctly to the Supabase PostgREST layer.
  const activeTeam = await getActiveTeam(db, user.id);
  if (!activeTeam) return null;

  // Verify user is actually a member of this team before any queries/mutations
  const { data: membership, error: membershipError } = await db
    .from('team_members')
    .select('role')
    .eq('team_id', activeTeam.id)
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle();

  if (membershipError || !membership) return null;

  const { isCoach } = await getUserAccess(activeTeam.id, user.id);

  // Get channel IDs the user belongs to
  const { data: memberOf, error: memberOfError } = await db
    .from('channel_members')
    .select('channel_id')
    .eq('user_id', user.id);

  if (memberOfError) {
    console.error('Failed to fetch channel_members:', memberOfError.message);
    return null;
  }

  const channelIds = memberOf?.map((m) => m.channel_id) ?? [];

  // Fetch those channels with all member profiles (for DM display names)
  let channels: SidebarChannel[] = [];
  if (channelIds.length > 0) {
    const { data: channelsData, error: channelsError } = await db
      .from('channels')
      .select(`
        id, name, channel_type, description,
        channel_members(user_id, user_profiles(first_name, last_name))
      `)
      .eq('team_id', activeTeam.id)
      .in('id', channelIds)
      .order('name');

    if (channelsError) {
      console.error('Failed to fetch channels:', channelsError.message);
      return null;
    }

    channels = (channelsData ?? []) as unknown as SidebarChannel[];
  }

  // Seed defaults if first visit
  if (channels.length === 0) {
    await seedDefaultChannels(db, activeTeam.id, user.id);

    const { data: freshMemberOf, error: freshMemberError } = await db
      .from('channel_members')
      .select('channel_id')
      .eq('user_id', user.id);

    if (freshMemberError) {
      console.error('Failed to fetch channel_members after seed:', freshMemberError.message);
      return null;
    }

    const freshIds = freshMemberOf?.map((m) => m.channel_id) ?? [];
    if (freshIds.length > 0) {
      const { data: freshChannelsData, error: freshChannelsError } = await db
        .from('channels')
        .select(`
          id, name, channel_type, description,
          channel_members(user_id, user_profiles(first_name, last_name))
        `)
        .eq('team_id', activeTeam.id)
        .in('id', freshIds)
        .order('name');

      if (freshChannelsError) {
        console.error('Failed to fetch channels after seed:', freshChannelsError.message);
        return null;
      }

      channels = (freshChannelsData ?? []) as unknown as SidebarChannel[];
    }
  }

  return {
    announcements: channels.filter((c) => c.channel_type === 'announcement'),
    topics: channels.filter((c) => c.channel_type === 'topic'),
    dms: channels.filter((c) => c.channel_type === 'direct'),
    isCoach,
    teamId: activeTeam.id,
    teamName: activeTeam.name,
    userId: user.id,
  };
}
