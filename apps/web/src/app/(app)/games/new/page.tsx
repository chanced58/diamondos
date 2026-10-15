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

export default async function NewGamePage({
  searchParams,
}: {
  searchParams?: { tournamentId?: string };
}): Promise<JSX.Element | null> {
  const auth = createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return null;

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const tournamentId = searchParams?.tournamentId?.trim() || null;
  let selectedTeam: { id: string; name: string } | null = null;
  let tournamentName: string | null = null;

  if (tournamentId) {
    const { data: tournament } = await db
      .from('tournaments')
      .select('id, name')
      .eq('id', tournamentId)
      .maybeSingle();
    const { data: tournamentTeam } = await db
      .from('tournament_teams')
      .select('team_id')
      .eq('tournament_id', tournamentId)
      .maybeSingle();

    if (tournament && tournamentTeam) {
      const [teamResult, access] = await Promise.all([
        db.from('teams').select('id, name').eq('id', tournamentTeam.team_id).maybeSingle(),
        getUserAccess(tournamentTeam.team_id, user.id),
      ]);
      if (teamResult.data && access.isCoach) {
        selectedTeam = teamResult.data;
        tournamentName = tournament.name;
      }
    }
  } else {
    const activeTeam = await getActiveTeam(auth, user.id);
    if (activeTeam) {
      const { isCoach } = await getUserAccess(activeTeam.id, user.id);
      if (isCoach) selectedTeam = { id: activeTeam.id, name: activeTeam.name };
    }
  }

  if (!selectedTeam) {
    return (
      <div className="p-8">
        <p className="text-gray-500">
          {tournamentId
            ? 'Tournament not found or you are not a coach for its team.'
            : 'No team found, or you are not a coach for the active team.'}{' '}
          {!tournamentId && (
            <>
              <Link href="/admin/create-team" className="text-brand-700 hover:underline">
                Create a team
              </Link>{' '}
              first.
            </>
          )}
        </p>
      </div>
    );
  }

  // Team-owned opponent teams
  const { data: teamOpponents } = await db
    .from('opponent_teams')
    .select('id, name, city')
    .eq('team_id', selectedTeam.id)
    .order('name');

  // League opponent teams (if team is in a league)
  let leagueOpponents: { id: string; name: string; city: string | null }[] = [];
  const league = tournamentId ? null : await getActiveLeague(selectedTeam.id);
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
        <Link href={tournamentId ? `/tournaments/${tournamentId}` : '/games'} className="text-sm text-brand-700 hover:underline">
          &larr; Back to {tournamentId ? 'tournament' : 'schedule'}
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-2">{tournamentId ? 'Schedule Tournament Game' : 'Schedule a Game'}</h1>
        <p className="text-gray-500 text-sm">{selectedTeam.name}{tournamentName ? ` · ${tournamentName}` : ''}</p>
      </div>
      <AddGameForm teamId={selectedTeam.id} tournamentId={tournamentId ?? undefined} opponentTeams={uniqueOpponentTeams} />
    </div>
  );
}
