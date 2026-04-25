import type { JSX } from 'react';
import { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { getUserAccess } from '@/lib/user-access';
import { weAreHome } from '@baseball/shared';
import { OpponentLineupManager } from './OpponentLineupManager';

export const metadata: Metadata = { title: 'Opponent Lineup' };

export default async function OpponentLineupPage({
  params,
}: {
  params: { gameId: string };
}): Promise<JSX.Element | null> {
  const auth = createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return null;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing required Supabase environment variables');
  }

  const db = createClient(supabaseUrl, serviceRoleKey);

  const { data: game } = await db
    .from('games')
    .select('id, team_id, opponent_name, opponent_team_id, location_type, neutral_home_team')
    .eq('id', params.gameId)
    .single();

  if (!game) notFound();

  const { isCoach } = await getUserAccess(game.team_id, user.id);
  if (!isCoach) {
    redirect(`/games/${params.gameId}`);
  }

  // Load opponent team + players + lineup in parallel
  const [opponentTeamResult, playersResult, lineupResult] = await Promise.all([
    game.opponent_team_id
      ? db
          .from('opponent_teams')
          .select('id, name')
          .eq('id', game.opponent_team_id)
          .single()
      : Promise.resolve({ data: null }),
    game.opponent_team_id
      ? db
          .from('opponent_players')
          .select('id, first_name, last_name, jersey_number, primary_position')
          .eq('opponent_team_id', game.opponent_team_id)
          .eq('is_active', true)
          .order('last_name')
      : Promise.resolve({ data: [] }),
    db
      .from('opponent_game_lineups')
      .select('opponent_player_id, batting_order, starting_position')
      .eq('game_id', params.gameId),
  ]);

  const opponentTeam = opponentTeamResult.data
    ? { id: opponentTeamResult.data.id, name: opponentTeamResult.data.name }
    : null;

  const players = (playersResult.data ?? []).map((p) => ({
    id: p.id,
    firstName: p.first_name,
    lastName: p.last_name,
    jerseyNumber: p.jersey_number,
    primaryPosition: p.primary_position,
  }));

  const existingLineup = (lineupResult.data ?? []).map((l) => ({
    playerId: l.opponent_player_id,
    battingOrder: l.batting_order ?? 0,
    startingPosition: l.starting_position,
  }));

  const vsAt = weAreHome(game.location_type, game.neutral_home_team) ? 'vs' : '@';

  return (
    <div className="p-8 max-w-2xl">
      <Link href={`/games/${params.gameId}`} className="text-sm text-brand-700 hover:underline">
        ← Back to game
      </Link>

      <div className="mt-4 mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Opponent Lineup</h1>
        <p className="text-gray-500 text-sm mt-1">
          {vsAt} {game.opponent_name}
        </p>
      </div>

      <OpponentLineupManager
        gameId={params.gameId}
        opponentTeam={opponentTeam}
        defaultOpponentName={game.opponent_name}
        players={players}
        existingLineup={existingLineup}
      />
    </div>
  );
}
