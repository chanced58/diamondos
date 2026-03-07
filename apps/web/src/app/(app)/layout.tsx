import type { JSX } from 'react';
import { redirect } from 'next/navigation';
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

  // Self-healing: if user created a team but has no team_members row,
  // auto-create the membership. This handles cases where the create-team
  // edge function's team_members insert failed silently.
  if (!activeTeam) {
    const db = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    // Check for teams the user created OR any team if user is platform admin
    let createdTeam: any = null;

    const { data: ownTeam } = await db
      .from('teams')
      .select('id, name, organization, logo_url, primary_color, secondary_color')
      .eq('created_by', user.id)
      .limit(1)
      .maybeSingle();
    createdTeam = ownTeam;

    if (!createdTeam) {
      // Fallback: check if user is platform admin and grab first available team
      const { data: profile } = await db
        .from('user_profiles')
        .select('is_platform_admin')
        .eq('id', user.id)
        .maybeSingle();

      if (profile?.is_platform_admin) {
        const { data: anyTeam } = await db
          .from('teams')
          .select('id, name, organization, logo_url, primary_color, secondary_color')
          .limit(1)
          .maybeSingle();
        createdTeam = anyTeam;
      }
    }

    if (createdTeam) {
      await db.from('team_members').upsert(
        { team_id: createdTeam.id, user_id: user.id, role: 'head_coach', is_active: true },
        { onConflict: 'team_id,user_id' },
      );

      // Also backfill user_profiles.email if missing
      await db
        .from('user_profiles')
        .update({ email: user.email })
        .eq('id', user.id)
        .is('email', null);

      activeTeam = {
        id: createdTeam.id,
        name: createdTeam.name,
        organization: createdTeam.organization,
        logo_url: createdTeam.logo_url,
        primary_color: createdTeam.primary_color,
        secondary_color: createdTeam.secondary_color,
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
      />
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
