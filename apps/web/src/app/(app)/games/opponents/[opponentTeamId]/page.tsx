import type { JSX } from 'react';
import { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { getActiveTeam } from '@/lib/active-team';
import { getUserAccess } from '@/lib/user-access';
import { OpponentRosterClient } from './OpponentRosterClient';

export const metadata: Metadata = { title: 'Opponent Roster' };

export default async function OpponentTeamDetailPage({
  params,
}: {
  params: Promise<{ opponentTeamId: string }>;
}): Promise<JSX.Element | null> {
  const { opponentTeamId } = await params;

  const auth = createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) redirect('/login');

  const activeTeam = await getActiveTeam(auth, user.id);
  if (!activeTeam) redirect('/dashboard');

  const { isCoach } = await getUserAccess(activeTeam.id, user.id);
  if (!isCoach) redirect('/games/opponents');

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Fetch opponent team — must belong to this team
  const { data: team } = await db
    .from('opponent_teams')
    .select('id, name, abbreviation, city, state_code, team_id')
    .eq('id', opponentTeamId)
    .single();

  if (!team || team.team_id !== activeTeam.id) redirect('/games/opponents');

  // Fetch active players
  const { data: rawPlayers } = await db
    .from('opponent_players')
    .select('id, first_name, last_name, jersey_number, primary_position, bats, throws')
    .eq('opponent_team_id', opponentTeamId)
    .eq('is_active', true)
    .order('jersey_number', { ascending: true, nullsFirst: false });

  const players = (rawPlayers ?? []).map((p) => ({
    id: p.id,
    firstName: p.first_name,
    lastName: p.last_name,
    jerseyNumber: p.jersey_number,
    primaryPosition: p.primary_position,
    bats: p.bats,
    throws: p.throws,
  }));

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-6">
        <Link href="/games/opponents" className="text-sm text-brand-700 hover:underline">
          &larr; Back to opponent teams
        </Link>
        <div className="flex items-baseline justify-between mt-2 gap-3 flex-wrap">
          <h1 className="text-2xl font-bold text-gray-900">{team.name}</h1>
          <Link
            href={`/games/opponents/${opponentTeamId}/card`}
            className="text-sm bg-brand-700 text-white font-semibold px-3 py-1.5 rounded-md hover:bg-brand-800"
          >
            Scouting card
          </Link>
        </div>
        <p className="text-gray-500 text-sm">
          Opponent team roster
          {team.city && <> &middot; {team.city}{team.state_code ? `, ${team.state_code}` : ''}</>}
        </p>
      </div>

      <OpponentRosterClient
        team={{
          id: team.id,
          name: team.name,
          abbreviation: team.abbreviation,
          city: team.city,
          stateCode: team.state_code,
        }}
        players={players}
      />
    </div>
  );
}
