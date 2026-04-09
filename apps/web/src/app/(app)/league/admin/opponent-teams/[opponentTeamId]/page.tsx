import type { JSX } from 'react';
import { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { getActiveTeam } from '@/lib/active-team';
import { getActiveLeague } from '@/lib/active-league';
import { getLeagueAccess } from '@/lib/league-access';
import { OpponentTeamRosterClient } from './OpponentTeamRosterClient';

export const metadata: Metadata = { title: 'Manage Opponent Team' };

export default async function OpponentTeamPage({
  params,
}: {
  params: Promise<{ opponentTeamId: string }>;
}): Promise<JSX.Element | null> {
  const { opponentTeamId } = await params;

  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const activeTeam = await getActiveTeam(supabase, user.id);
  if (!activeTeam) redirect('/dashboard');

  const league = await getActiveLeague(activeTeam.id);
  if (!league) redirect('/league');

  const access = await getLeagueAccess(league.id, user.id);
  if (!access.isLeagueStaff) redirect('/league');

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Fetch opponent team — must belong to this league
  const { data: team } = await db
    .from('opponent_teams')
    .select('id, name, abbreviation, city, state_code, stats_visible, league_id')
    .eq('id', opponentTeamId)
    .single();

  if (!team || team.league_id !== league.id) redirect('/league/admin');

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
        <Link href="/league/admin" className="text-sm text-brand-700 hover:underline">
          &larr; Back to league admin
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-2">{team.name}</h1>
        <p className="text-gray-500 text-sm">
          Opponent team roster management
          {team.city && <> &middot; {team.city}{team.state_code ? `, ${team.state_code}` : ''}</>}
        </p>
      </div>

      <OpponentTeamRosterClient
        team={{
          id: team.id,
          name: team.name,
          abbreviation: team.abbreviation,
          city: team.city,
          stateCode: team.state_code,
          statsVisible: team.stats_visible,
        }}
        players={players}
      />
    </div>
  );
}
