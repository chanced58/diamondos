import type { JSX } from 'react';
import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { getActiveTeam } from '@/lib/active-team';
import { getActiveLeague } from '@/lib/active-league';
import { getLeagueAccess } from '@/lib/league-access';
import { getLeagueTeamsAll, getLeagueDivisions, getLeagueStaff } from '@baseball/database';
import { LeagueAdminClient } from './LeagueAdminClient';

export const metadata: Metadata = { title: 'League Admin' };

export default async function LeagueAdminPage(): Promise<JSX.Element | null> {
  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const activeTeam = await getActiveTeam(supabase, user.id);
  if (!activeTeam) redirect('/dashboard');

  const league = await getActiveLeague(activeTeam.id);
  if (!league) redirect('/league');

  const access = await getLeagueAccess(league.id, user.id);
  if (!access.isLeagueStaff) redirect('/league');

  // Guard: redirect to setup wizard if league setup is not complete
  if (!league.setup_completed_at) redirect('/league/setup');

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const [teams, divisions, staff] = await Promise.all([
    getLeagueTeamsAll(db, league.id),
    getLeagueDivisions(db, league.id),
    getLeagueStaff(db, league.id),
  ]);

  // Fetch all opponent teams on the platform so any can be added to the league
  const { data: availableOpponentTeams } = await db
    .from('opponent_teams')
    .select('id, name, city')
    .order('name');

  return (
    <div className="p-8 max-w-4xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Manage League</h1>
      <p className="text-gray-500 mb-6">{league.name}</p>

      <LeagueAdminClient
        leagueId={league.id}
        teams={teams.map((t) => ({
          id: t.id,
          teamId: t.team_id ?? t.opponent_team_id ?? '',
          teamName: t.teams?.name ?? t.opponent_teams?.name ?? 'Unknown',
          organization: t.teams?.organization ?? null,
          divisionId: t.division_id,
          isOpponentTeam: t.opponent_team_id !== null,
          isActive: t.is_active,
        }))}
        divisions={divisions}
        staff={staff.map((s) => {
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
        isAdmin={access.isLeagueAdmin}
        availableOpponentTeams={(availableOpponentTeams ?? []).map((t) => ({
          id: t.id,
          name: t.name,
          city: t.city,
        }))}
      />
    </div>
  );
}
