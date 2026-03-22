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

  const activeTeam = await getActiveTeam(auth, user.id);
  if (!activeTeam) return null;

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { isCoach } = await getUserAccess(activeTeam.id, user.id);

  // Get channel IDs the user belongs to
  const { data: memberOf } = await db
    .from('channel_members')
    .select('channel_id')
    .eq('user_id', user.id);

  const channelIds = memberOf?.map((m) => m.channel_id) ?? [];

  // Fetch those channels with all member profiles (for DM display names)
  let channels: SidebarChannel[] = [];
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
    channels = (data ?? []) as unknown as SidebarChannel[];
  }

  // Seed defaults if first visit
  if (channels.length === 0) {
    await seedDefaultChannels(db, activeTeam.id, user.id);

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
      channels = (data ?? []) as unknown as SidebarChannel[];
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
