import type { JSX } from 'react';
import { Metadata } from 'next';
import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { getLeagueTeams, getLeagueDivisions, getLeagueStaff } from '@baseball/database';
import { LeagueAdminClient } from '@/app/(app)/league/admin/LeagueAdminClient';

export const metadata: Metadata = { title: 'Manage League — Platform Admin' };

export default async function PlatformAdminLeagueDetailPage({
  params,
}: {
  params: Promise<{ leagueId: string }>;
}): Promise<JSX.Element | null> {
  const { leagueId } = await params;

  const auth = createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) redirect('/login');

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Gate: platform admin only
  const { data: profile } = await db
    .from('user_profiles')
    .select('is_platform_admin')
    .eq('id', user.id)
    .single();

  if (!profile?.is_platform_admin) redirect('/admin');

  // Fetch the league itself
  const { data: league, error: leagueError } = await (db as any)
    .from('leagues')
    .select('id, name, description, state_code')
    .eq('id', leagueId)
    .single();

  if (leagueError) throw new Error(`Failed to fetch league: ${leagueError.message}`);
  if (!league) notFound();

  const [teams, divisions, staff, allTeamsResult] = await Promise.all([
    getLeagueTeams(db, leagueId),
    getLeagueDivisions(db, leagueId),
    getLeagueStaff(db, leagueId),
    db.from('teams').select('id, name, organization').order('name'),
  ]);

  const availableTeams = (allTeamsResult.data ?? []).map((t: any) => ({
    id: t.id as string,
    name: t.name as string,
    organization: t.organization as string | null,
  }));

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center gap-3 mb-1">
        <Link href="/admin/leagues" className="text-sm text-brand-700 hover:underline">
          &larr; All Leagues
        </Link>
      </div>
      <h1 className="text-2xl font-bold text-gray-900 mt-3 mb-1">{league.name}</h1>
      <p className="text-gray-500 mb-6">
        {[league.description, league.state_code].filter(Boolean).join(' · ') || 'League administration'}
      </p>

      <LeagueAdminClient
        leagueId={leagueId}
        teams={teams.map((t) => ({
          id: t.id,
          teamId: t.team_id,
          teamName: t.teams?.name ?? 'Unknown',
          organization: t.teams?.organization ?? null,
          divisionId: t.division_id,
        }))}
        divisions={divisions}
        staff={staff.map((s) => {
          // Supabase may return joined relations as an object or array depending
          // on the relationship cardinality; normalize to a single profile to
          // prevent runtime errors when accessing first_name/last_name.
          const profile = Array.isArray(s.user_profiles) ? s.user_profiles[0] : s.user_profiles;
          return {
            id: s.id,
            userId: s.user_id,
            role: s.role,
            name: profile
              ? `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim() || profile.email || 'Unknown'
              : 'Unknown',
          };
        })}
        isAdmin={true}
        availableTeams={availableTeams}
      />
    </div>
  );
}
