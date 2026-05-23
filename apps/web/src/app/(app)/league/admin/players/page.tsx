import type { JSX } from 'react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { getActiveTeam } from '@/lib/active-team';
import { getActiveLeague } from '@/lib/active-league';
import { getLeagueAccess } from '@/lib/league-access';
import {
  getLeagueTeamsAll,
  getLeagueDivisions,
  getLeagueForStaff,
  getLeaguePlayers,
} from '@baseball/database';
import { LeaguePlayersTable } from './LeaguePlayersTable';

export const metadata: Metadata = { title: 'League Players' };

export default async function LeaguePlayersPage(): Promise<JSX.Element | null> {
  const auth = createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) redirect('/login');

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const activeTeam = await getActiveTeam(auth, user.id);
  let leagueId: string | null =
    activeTeam ? (await getActiveLeague(activeTeam.id))?.id ?? null : null;
  if (!leagueId) {
    const staffLeague = await getLeagueForStaff(db, user.id);
    leagueId = staffLeague?.id ?? null;
  }
  if (!leagueId) redirect('/dashboard');

  const access = await getLeagueAccess(leagueId, user.id);
  if (!access.isLeagueStaff) redirect('/dashboard');

  const [players, teams, divisions] = await Promise.all([
    getLeaguePlayers(db, leagueId),
    getLeagueTeamsAll(db, leagueId),
    getLeagueDivisions(db, leagueId),
  ]);

  const rosterTeams = teams
    .filter((t) => !t.opponent_team_id && t.is_active)
    .map((t) => ({
      id: t.team_id!,
      name: t.teams?.name ?? 'Unknown',
      divisionId: t.division_id,
    }));

  const freeAgentCount = players.filter((p) => p.player.team_id === null).length;

  return (
    <div className="p-8 max-w-6xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">League Players</h1>
      <p className="text-gray-500 mb-6">
        {players.length} players · {freeAgentCount} free agents · {rosterTeams.length} teams
      </p>
      <LeaguePlayersTable
        leagueId={leagueId}
        players={players}
        teams={rosterTeams}
        divisions={divisions.map((d) => ({ id: d.id, name: d.name }))}
        canEdit={access.isLeagueAdmin}
      />
    </div>
  );
}
