import type { JSX } from 'react';
import { Metadata } from 'next';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { getActiveTeam } from '@/lib/active-team';
import { getActiveLeague } from '@/lib/active-league';
import { getUserAccess } from '@/lib/user-access';
import { AddGameForm } from './AddGameForm';

export const metadata: Metadata = { title: 'Add Game' };

export default async function NewGamePage(): Promise<JSX.Element | null> {
  const auth = createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return null;

  const activeTeam = await getActiveTeam(auth, user.id);

  if (!activeTeam) {
    return (
      <div className="p-8">
        <p className="text-gray-500">
          No team found.{' '}
          <Link href="/admin/create-team" className="text-brand-700 hover:underline">
            Create a team
          </Link>{' '}
          first.
        </p>
      </div>
    );
  }

  const { isCoach } = await getUserAccess(activeTeam.id, user.id);

  if (!isCoach) {
    return (
      <div className="p-8">
        <p className="text-gray-500">Only coaches can schedule games.</p>
      </div>
    );
  }

  // Fetch opponent teams available to this team (team-owned + league opponent teams)
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Team-owned opponent teams
  const { data: teamOpponents } = await db
    .from('opponent_teams')
    .select('id, name, city')
    .eq('team_id', activeTeam.id)
    .order('name');

  // League opponent teams (if team is in a league)
  let leagueOpponents: { id: string; name: string; city: string | null }[] = [];
  const league = await getActiveLeague(activeTeam.id);
  if (league) {
    const { data: leagueMembers } = await db
      .from('league_members')
      .select('opponent_team_id, opponent_teams(id, name, city)')
      .eq('league_id', league.id)
      .not('opponent_team_id', 'is', null);
    leagueOpponents = (leagueMembers ?? [])
      .filter((m) => m.opponent_teams)
      .map((m) => {
        const ot = Array.isArray(m.opponent_teams) ? m.opponent_teams[0] : m.opponent_teams;
        return { id: ot.id, name: ot.name, city: ot.city };
      });
  }

  // Merge and deduplicate
  const allOpponentTeams = [...(teamOpponents ?? []), ...leagueOpponents];
  const uniqueOpponentTeams = Array.from(
    new Map(allOpponentTeams.map((t) => [t.id, t])).values(),
  ).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="p-8 max-w-lg">
      <div className="mb-6">
        <Link href="/games" className="text-sm text-brand-700 hover:underline">
          &larr; Back to schedule
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-2">Schedule a Game</h1>
        <p className="text-gray-500 text-sm">{activeTeam.name}</p>
      </div>
      <AddGameForm teamId={activeTeam.id} opponentTeams={uniqueOpponentTeams} />
    </div>
  );
}
