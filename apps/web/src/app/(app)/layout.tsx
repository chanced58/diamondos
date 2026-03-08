import type { JSX } from 'react';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { getTeamsForUser } from '@baseball/database';
import type { TeamSummary } from '@baseball/database';
import type { ReactNode } from 'react';
import { Sidebar } from '@/components/layout/Sidebar';

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
      />
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
