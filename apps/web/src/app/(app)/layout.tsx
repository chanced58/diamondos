import type { JSX } from 'react';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { getTeamsForUser, getLeagueForStaff } from '@baseball/database';
import type { TeamSummary } from '@baseball/database';
import type { ReactNode } from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import { ensureChannelMembership, healMissingTeamMembership } from '@/lib/membership-self-heal';
import { getActiveLeague } from '@/lib/active-league';
import { getLeagueAccess } from '@/lib/league-access';
import { getTeamTier } from '@/lib/team-tier';
import { getTrainingProgress, hasCoachingRole } from '@/lib/training/get-progress';

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

  // Check if user has a Player Pro profile — used to surface the My Profile
  // nav item and to skip team-membership self-healing for player-only users.
  let hasPlayerProfile = false;
  if (db) {
    try {
      const { data: pp } = await db
        .from('player_profiles')
        .select('user_id')
        .eq('user_id', user.id)
        .maybeSingle();
      hasPlayerProfile = !!pp;
    } catch {
      // Non-fatal
    }
  }

  // Self-healing (see lib/membership-self-heal.ts): a NON-admin user with no
  // team_members row gets one back from the team they created or an invite
  // they hold. Platform admins don't need team_members rows —
  // they access teams via the admin panel cookie.
  //
  // Dual-role limitation: a Pro player who is ALSO a coach/invitee will skip
  // this auto-heal on first load because hasPlayerProfile=true short-circuits
  // below. If they land here with activeTeam already set (from getTeamsForUser),
  // nothing to heal. If they don't, visiting /dashboard won't auto-create the
  // team_members row — they'll need to follow their coach invite link or have
  // the coach re-invite them. Low-volume edge case; revisit if it comes up.
  if (!activeTeam && !isPlatformAdmin && !hasPlayerProfile && db) {
    activeTeam = await healMissingTeamMembership(db, user);
  }

  if (activeTeam && db) {
    await ensureChannelMembership(db, user.id, [activeTeam.id]);
  }

  // League admin detection: check if the user is league staff (with or without a team).
  // Used for setup redirect and for providing league context to the sidebar.
  let staffLeague: Awaited<ReturnType<typeof getLeagueForStaff>> = null;
  if (!isPlatformAdmin && db) {
    try {
      staffLeague = await getLeagueForStaff(db, user.id);
    } catch {
      // Non-fatal — fall through to normal flow
    }
  }

  // Redirect to setup wizard if league admin hasn't completed setup.
  // Note: redirect() must be OUTSIDE try/catch — it throws a NEXT_REDIRECT error.
  if (!activeTeam && staffLeague && !staffLeague.setup_completed_at) {
    redirect('/league/setup');
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

  // Resolve league context and subscription tier for the active team.
  // For standalone league admins (no team), use the staffLeague directly.
  let league = activeTeam ? await getActiveLeague(activeTeam.id) : null;
  const subscriptionTier = activeTeam ? await getTeamTier(activeTeam.id) : null;

  // Fallback: if user has no team but IS league staff with completed setup,
  // use their staff league for sidebar context.
  if (!league && staffLeague && staffLeague.setup_completed_at) {
    league = {
      id: staffLeague.id,
      name: staffLeague.name,
      description: staffLeague.description,
      logo_url: staffLeague.logo_url,
      state_code: staffLeague.state_code,
      setup_completed_at: staffLeague.setup_completed_at,
      slug: staffLeague.slug,
    };
  }

  // Check if user is a league admin (for sidebar nav)
  const leagueAccess = league ? await getLeagueAccess(league.id, user.id) : null;

  // Training entry-point gating + Certified badge state
  const [showTraining, trainingProgress] = await Promise.all([
    hasCoachingRole(user.id),
    getTrainingProgress(user.id),
  ]);

  // Pull display name for the sidebar footer
  let userName: string | undefined;
  let userInitials: string | undefined;
  if (db) {
    try {
      const { data: profile } = await db
        .from('user_profiles')
        .select('first_name, last_name')
        .eq('id', user.id)
        .maybeSingle();
      if (profile?.first_name || profile?.last_name) {
        userName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ');
        userInitials = [profile?.first_name?.[0], profile?.last_name?.[0]]
          .filter(Boolean)
          .join('')
          .toUpperCase();
      }
    } catch {
      // Non-fatal
    }
  }
  if (!userName && user.email) userName = user.email.split('@')[0];
  if (!userInitials && userName) userInitials = userName.slice(0, 2).toUpperCase();

  return (
    <div className="app">
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
        leagueSlug={league?.slug ?? undefined}
        subscriptionTier={subscriptionTier ?? undefined}
        hasPlayerProfile={hasPlayerProfile}
        isLeagueAdmin={leagueAccess?.isLeagueAdmin ?? false}
        userName={userName}
        userInitials={userInitials}
        showTraining={showTraining}
        isCertified={trainingProgress.isCertified}
      />
      <main className="main">
        {children}
      </main>
    </div>
  );
}
