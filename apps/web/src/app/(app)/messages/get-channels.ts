import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { getActiveTeam, type ActiveTeam } from '@/lib/active-team';
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

const TEAM_SELECT = 'id, name, organization, logo_url, primary_color, secondary_color';

/**
 * Attempts to self-heal a missing team_members row by checking team ownership
 * (created_by) first, then pending/accepted invitations.
 *
 * When `forTeamId` is given only that team is checked; otherwise the most
 * recently created matching team or invitation is used.
 *
 * Returns the resolved team on success, null if healing was not possible.
 */
async function selfHealMembership(
  db: SupabaseClient,
  userId: string,
  userEmail: string | undefined,
  forTeamId?: string,
): Promise<ActiveTeam | null> {
  // 1. Check if the user created the team
  let teamQuery = db
    .from('teams')
    .select(TEAM_SELECT)
    .eq('created_by', userId)
    .order('created_at', { ascending: false })
    .limit(1);
  if (forTeamId) teamQuery = teamQuery.eq('id', forTeamId);

  const { data: ownTeam, error: ownTeamError } = await teamQuery.maybeSingle();
  if (ownTeamError) {
    console.error('Self-heal: teams query failed:', ownTeamError.message);
    return null;
  }

  if (ownTeam) {
    const { error } = await db.from('team_members').upsert(
      { team_id: ownTeam.id, user_id: userId, role: 'head_coach', is_active: true },
      { onConflict: 'team_id,user_id' },
    );
    if (error) {
      console.error('Self-heal: team_members upsert failed:', error.message);
      return null;
    }
    return ownTeam as ActiveTeam;
  }

  // 2. Check invitations
  if (!userEmail) return null;

  let inviteQuery = db
    .from('team_invitations')
    .select('id, team_id, role, status')
    .eq('email', userEmail.toLowerCase())
    .in('status', ['pending', 'accepted'])
    .order('invited_at', { ascending: false })
    .limit(1);
  if (forTeamId) inviteQuery = inviteQuery.eq('team_id', forTeamId);

  const { data: invite, error: inviteError } = await inviteQuery.maybeSingle();
  if (inviteError) {
    console.error('Self-heal: invitations query failed:', inviteError.message);
    return null;
  }
  if (!invite) return null;

  const { error: memberError } = await db.from('team_members').upsert(
    { team_id: invite.team_id, user_id: userId, role: invite.role, is_active: true },
    { onConflict: 'team_id,user_id' },
  );
  if (memberError) {
    console.error('Self-heal: team_members upsert failed:', memberError.message);
    return null;
  }

  if (invite.status === 'pending') {
    const { error: updateError } = await db
      .from('team_invitations')
      .update({ status: 'accepted', accepted_at: new Date().toISOString() })
      .eq('id', invite.id);
    if (updateError) {
      console.error('Self-heal: invitation update failed:', updateError.message);
      // Non-fatal — membership was already created
    }
  }

  try {
    await addToTeamChannels(db, invite.team_id, userId, invite.role);
  } catch (e) {
    console.error('Self-heal: addToTeamChannels failed:', e);
    // Non-fatal — channel membership will be retried on next page load
  }

  const { data: team } = await db
    .from('teams')
    .select(TEAM_SELECT)
    .eq('id', invite.team_id)
    .maybeSingle();
  return (team as ActiveTeam) ?? null;
}

export async function getChannelSidebarData(): Promise<ChannelSidebarData | null> {
  const auth = createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return null;

  // Service-role client for writes that bypass RLS (guarded — null when key is missing)
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const db = serviceRoleKey
    ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey)
    : null;

  // Resolve team — auth client first (cookie-based, matches games/dashboard pattern),
  // service-role fallback, then self-healing from created_by / invitations.
  let activeTeam = await getActiveTeam(auth, user.id);
  if (!activeTeam && db) {
    activeTeam = await getActiveTeam(db, user.id);
  }
  if (!activeTeam && db) {
    activeTeam = await selfHealMembership(db, user.id, user.email);
  }
  if (!activeTeam) return null;

  // Prefer service-role for read queries (bypasses RLS issues in standalone mode);
  // fall back to auth client when the service-role key is not configured.
  const queryClient = db ?? auth;

  // Verify membership, with self-healing if missing
  let { data: membership, error: membershipError } = await queryClient
    .from('team_members')
    .select('role')
    .eq('team_id', activeTeam.id)
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle();

  if ((membershipError || !membership) && db) {
    const healed = await selfHealMembership(db, user.id, user.email, activeTeam.id);
    if (healed) {
      const { data: retried } = await queryClient
        .from('team_members')
        .select('role')
        .eq('team_id', activeTeam.id)
        .eq('user_id', user.id)
        .eq('is_active', true)
        .maybeSingle();
      membership = retried;
      membershipError = null;
    }
  }

  if (membershipError || !membership) return null;

  const { isCoach } = await getUserAccess(activeTeam.id, user.id);

  // Get channel IDs the user belongs to
  const { data: memberOf, error: memberOfError } = await queryClient
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
    const { data: channelsData, error: channelsError } = await queryClient
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
    await seedDefaultChannels(queryClient, activeTeam.id, user.id);

    const { data: freshMemberOf, error: freshMemberError } = await queryClient
      .from('channel_members')
      .select('channel_id')
      .eq('user_id', user.id);

    if (freshMemberError) {
      console.error('Failed to fetch channel_members after seed:', freshMemberError.message);
      return null;
    }

    const freshIds = freshMemberOf?.map((m) => m.channel_id) ?? [];
    if (freshIds.length > 0) {
      const { data: freshChannelsData, error: freshChannelsError } = await queryClient
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
