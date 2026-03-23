import 'server-only';

import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { getActiveTeam } from '@/lib/active-team';
import { getUserAccess } from '@/lib/user-access';
import { addToTeamChannels } from '@/lib/team-channels';
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

  // Service-role client for queries that need to bypass RLS (guarded)
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const db = serviceRoleKey
    ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey)
    : null;

  // Resolve team — use auth client (cookie-based, matches games/dashboard pattern).
  // Fall back to service-role if auth can't resolve the team.
  let activeTeam = await getActiveTeam(auth, user.id);
  if (!activeTeam && db) {
    activeTeam = await getActiveTeam(db, user.id);
  }

  // Self-heal: check created_by and invitations (mirrors (app)/layout.tsx)
  if (!activeTeam && db) {
    const { data: ownTeam } = await db
      .from('teams')
      .select('id, name, organization, logo_url, primary_color, secondary_color')
      .eq('created_by', user.id)
      .limit(1)
      .maybeSingle();

    if (ownTeam) {
      await db.from('team_members').upsert(
        { team_id: ownTeam.id, user_id: user.id, role: 'head_coach', is_active: true },
        { onConflict: 'team_id,user_id' },
      );
      activeTeam = ownTeam;
    } else if (user.email) {
      const { data: invite } = await db
        .from('team_invitations')
        .select('id, team_id, role, status')
        .eq('email', user.email.toLowerCase())
        .in('status', ['pending', 'accepted'])
        .limit(1)
        .maybeSingle();

      if (invite) {
        await db.from('team_members').upsert(
          { team_id: invite.team_id, user_id: user.id, role: invite.role, is_active: true },
          { onConflict: 'team_id,user_id' },
        );

        if (invite.status === 'pending') {
          await db.from('team_invitations')
            .update({ status: 'accepted', accepted_at: new Date().toISOString() })
            .eq('id', invite.id);
        }

        await addToTeamChannels(db, invite.team_id, user.id, invite.role);

        const { data: invitedTeam } = await db
          .from('teams')
          .select('id, name, organization, logo_url, primary_color, secondary_color')
          .eq('id', invite.team_id)
          .maybeSingle();
        if (invitedTeam) activeTeam = invitedTeam;
      }
    }
  }

  if (!activeTeam) return null;

  // Use service-role for data queries when available (bypasses RLS in standalone),
  // otherwise fall back to auth client
  const q = db ?? auth;

  // Verify membership, with self-healing if missing
  let { data: membership, error: membershipError } = await q
    .from('team_members')
    .select('role')
    .eq('team_id', activeTeam.id)
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle();

  if ((membershipError || !membership) && db) {
    // Self-heal: try to (re)create membership from created_by or invitations
    const { data: ownTeam } = await db
      .from('teams')
      .select('id')
      .eq('id', activeTeam.id)
      .eq('created_by', user.id)
      .maybeSingle();

    if (ownTeam) {
      await db.from('team_members').upsert(
        { team_id: activeTeam.id, user_id: user.id, role: 'head_coach', is_active: true },
        { onConflict: 'team_id,user_id' },
      );
    } else if (user.email) {
      const { data: invite } = await db
        .from('team_invitations')
        .select('id, role, status')
        .eq('team_id', activeTeam.id)
        .eq('email', user.email.toLowerCase())
        .in('status', ['pending', 'accepted'])
        .limit(1)
        .maybeSingle();

      if (invite) {
        await db.from('team_members').upsert(
          { team_id: activeTeam.id, user_id: user.id, role: invite.role, is_active: true },
          { onConflict: 'team_id,user_id' },
        );

        if (invite.status === 'pending') {
          await db.from('team_invitations')
            .update({ status: 'accepted', accepted_at: new Date().toISOString() })
            .eq('id', invite.id);
        }

        await addToTeamChannels(db, activeTeam.id, user.id, invite.role);
      }
    }

    // Re-check after self-healing
    const { data: healed } = await q
      .from('team_members')
      .select('role')
      .eq('team_id', activeTeam.id)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle();
    membership = healed;
    membershipError = null;
  }

  if (membershipError || !membership) return null;

  const { isCoach } = await getUserAccess(activeTeam.id, user.id);

  // Get channel IDs the user belongs to
  const { data: memberOf, error: memberOfError } = await q
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
    const { data: channelsData, error: channelsError } = await q
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
    await seedDefaultChannels(q, activeTeam.id, user.id);

    const { data: freshMemberOf, error: freshMemberError } = await q
      .from('channel_members')
      .select('channel_id')
      .eq('user_id', user.id);

    if (freshMemberError) {
      console.error('Failed to fetch channel_members after seed:', freshMemberError.message);
      return null;
    }

    const freshIds = freshMemberOf?.map((m) => m.channel_id) ?? [];
    if (freshIds.length > 0) {
      const { data: freshChannelsData, error: freshChannelsError } = await q
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
