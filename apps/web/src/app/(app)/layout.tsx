import type { JSX } from 'react';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { getTeamsForUser } from '@baseball/database';
import type { TeamSummary } from '@baseball/database';
import type { ReactNode } from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import { addToTeamChannels } from '@/lib/team-channels';
import { getActiveLeague } from '@/lib/active-league';
import { getLeagueAccess } from '@/lib/league-access';
import { getTeamTier } from '@/lib/team-tier';

export default async function AppLayout({ children }: { children: ReactNode }): Promise<JSX.Element> {
  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const teams = await getTeamsForUser(supabase, user.id);
  let activeTeam = teams?.[0]?.teams as TeamSummary | undefined;

  // Create a single service-role client (guarded — won't crash if key is missing)
  let isPlatformAdmin = false;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const db = serviceRoleKey
    ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey)
    : null;

  // Check if user is platform admin
  if (db) {
    try {
      const { data: adminProfile } = await db
        .from('user_profiles')
        .select('is_platform_admin')
        .eq('id', user.id)
        .maybeSingle();
      isPlatformAdmin = adminProfile?.is_platform_admin === true;
    } catch {
      // Fall back to non-admin if query fails
    }
  }

  // Self-healing: if a NON-admin user created a team but has no team_members row,
  // auto-create the membership. Platform admins don't need team_members rows —
  // they access teams via the admin panel cookie.
  if (!activeTeam && !isPlatformAdmin && db) {
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

      await db
        .from('user_profiles')
        .update({ email: user.email })
        .eq('id', user.id)
        .is('email', null);

      activeTeam = {
        id: ownTeam.id,
        name: ownTeam.name,
        organization: ownTeam.organization,
        logo_url: ownTeam.logo_url,
        primary_color: ownTeam.primary_color,
        secondary_color: ownTeam.secondary_color,
      };
    }
  }

  // Self-healing: ensure team membership exists for any invitation (pending or accepted).
  // Covers: lost callback URL params, direct login, and deactivated memberships from
  // failed user deletions.
  if (!activeTeam && !isPlatformAdmin && db && user.email) {
    const { data: invites } = await db
      .from('team_invitations')
      .select('id, team_id, role, email, first_name, last_name, status')
      .eq('email', user.email.toLowerCase())
      .in('status', ['pending', 'accepted'])
      .limit(5);

    if (invites && invites.length > 0) {
      for (const invite of invites) {
        // Ensure an active team_members row exists (creates or reactivates)
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
      }

      // Backfill name and email on profile if missing
      const firstInvite = invites[0];
      const { data: currentProfile } = await db
        .from('user_profiles')
        .select('first_name, last_name, email')
        .eq('id', user.id)
        .maybeSingle();

      const profileUpdates: Record<string, string | null> = {};
      if (!currentProfile?.email && user.email) profileUpdates.email = user.email;
      if (!currentProfile?.first_name && firstInvite.first_name) profileUpdates.first_name = firstInvite.first_name;
      if (!currentProfile?.last_name && firstInvite.last_name) profileUpdates.last_name = firstInvite.last_name;

      if (Object.keys(profileUpdates).length > 0) {
        await db.from('user_profiles').update(profileUpdates).eq('id', user.id);
      }

      // Fetch team directly via service-role client (bypasses RLS)
      const { data: invitedTeam } = await db
        .from('teams')
        .select('id, name, organization, logo_url, primary_color, secondary_color')
        .eq('id', invites[0].team_id)
        .maybeSingle();

      if (invitedTeam) {
        activeTeam = {
          id: invitedTeam.id,
          name: invitedTeam.name,
          organization: invitedTeam.organization,
          logo_url: invitedTeam.logo_url,
          primary_color: invitedTeam.primary_color,
          secondary_color: invitedTeam.secondary_color,
        };
      }
    }
  }

  // Ensure channel membership exists for the active team member.
  // Catches cases where the auth callback created team_members but missed
  // addToTeamChannels() (e.g., users who accepted invites before this fix).
  if (activeTeam && db) {
    try {
      const { data: channelMembership } = await db
        .from('channel_members')
        .select('channel_id')
        .eq('user_id', user.id)
        .limit(1);

      if (!channelMembership || channelMembership.length === 0) {
        const { data: membership } = await db
          .from('team_members')
          .select('role')
          .eq('team_id', activeTeam.id)
          .eq('user_id', user.id)
          .eq('is_active', true)
          .maybeSingle();

        if (membership) {
          await addToTeamChannels(db, activeTeam.id, user.id, membership.role);
        }
      }
    } catch {
      // Non-fatal — channel membership will be retried on next page load
    }
  }

  // Use the active-team-id cookie (set by middleware when visiting /teams/[id]/*)
  // to show the correct team's branding across all routes.
  const cookieStore = cookies();
  const activeTeamId = cookieStore.get('active-team-id')?.value;
  if (activeTeamId && activeTeamId !== activeTeam?.id && db) {
    const { data: selectedTeam } = await db
      .from('teams')
      .select('id, name, organization, logo_url, primary_color, secondary_color')
      .eq('id', activeTeamId)
      .maybeSingle();
    if (selectedTeam) {
      activeTeam = {
        id: selectedTeam.id,
        name: selectedTeam.name,
        organization: selectedTeam.organization,
        logo_url: selectedTeam.logo_url,
        primary_color: selectedTeam.primary_color,
        secondary_color: selectedTeam.secondary_color,
      };
    }
  }

  // Resolve league context and subscription tier for the active team
  const [league, subscriptionTier] = await Promise.all([
    activeTeam ? getActiveLeague(activeTeam.id) : null,
    activeTeam ? getTeamTier(activeTeam.id) : null,
  ]);

  // Check if user is a league admin (for sidebar nav)
  const leagueAccess = league ? await getLeagueAccess(league.id, user.id) : null;

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar
        teamName={activeTeam?.name}
        teamOrg={activeTeam?.organization ?? undefined}
        teamId={activeTeam?.id}
        logoUrl={activeTeam?.logo_url ?? undefined}
        primaryColor={activeTeam?.primary_color ?? undefined}
        secondaryColor={activeTeam?.secondary_color ?? undefined}
        isPlatformAdmin={isPlatformAdmin}
        leagueId={league?.id}
        leagueName={league?.name}
        subscriptionTier={subscriptionTier ?? undefined}
        isLeagueAdmin={leagueAccess?.isLeagueAdmin ?? false}
      />
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
