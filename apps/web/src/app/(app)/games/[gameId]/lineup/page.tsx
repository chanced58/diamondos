import type { JSX } from 'react';
import { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { weAreHome } from '@baseball/shared';
import { LineupBuilder } from './LineupBuilder';

export const metadata: Metadata = { title: 'Set Lineup' };

const COACH_ROLES = ['head_coach', 'assistant_coach', 'athletic_director'];

/** Map database enum values back to UI abbreviations. */
const DB_TO_POSITION: Record<string, string> = {
  pitcher: 'P',
  catcher: 'C',
  first_base: '1B',
  second_base: '2B',
  third_base: '3B',
  shortstop: 'SS',
  left_field: 'LF',
  center_field: 'CF',
  right_field: 'RF',
  designated_hitter: 'DH',
  infield: 'IF',
  outfield: 'OF',
  utility: 'UTIL',
};

export default async function LineupPage({ params }: { params: { gameId: string } }): Promise<JSX.Element | null> {
  const auth = createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return null;

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: game } = await db
    .from('games')
    .select('id, team_id, opponent_name, location_type, neutral_home_team, status')
    .eq('id', params.gameId)
    .single();

  if (!game) notFound();

  const { data: membership } = await db
    .from('team_members')
    .select('role')
    .eq('team_id', game.team_id)
    .eq('user_id', user.id)
    .single();

  if (!membership || !COACH_ROLES.includes(membership.role)) {
    redirect(`/games/${params.gameId}`);
  }

  const [playersResult, lineupResult] = await Promise.all([
    db
      .from('players')
      .select('id, first_name, last_name, jersey_number, primary_position')
      .eq('team_id', game.team_id)
      .eq('is_active', true)
      .order('last_name'),
    db
      .from('game_lineups')
      .select('player_id, batting_order, starting_position')
      .eq('game_id', params.gameId),
  ]);

  const players = (playersResult.data ?? []).map((p) => ({
    id: p.id,
    firstName: p.first_name,
    lastName: p.last_name,
    jerseyNumber: p.jersey_number,
    primaryPosition: p.primary_position ? DB_TO_POSITION[p.primary_position] ?? p.primary_position : null,
  }));

  const existingLineup = (lineupResult.data ?? []).map((l) => ({
    playerId: l.player_id,
    battingOrder: l.batting_order,
    startingPosition: l.starting_position ? DB_TO_POSITION[l.starting_position] ?? l.starting_position : null,
  }));

  const vsAt = weAreHome(game.location_type, game.neutral_home_team) ? 'vs' : '@';

  return (
    <div className="p-8 max-w-2xl">
      <Link href={`/games/${params.gameId}`} className="text-sm text-brand-700 hover:underline">
        ← Back to game
      </Link>

      <div className="mt-4 mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Set Lineup</h1>
        <p className="text-gray-500 text-sm mt-1">
          {vsAt} {game.opponent_name}
        </p>
      </div>

      {players.length === 0 ? (
        <div className="text-center py-10 text-gray-400">
          <p>No players on the roster yet.</p>
          <Link
            href={`/teams/${game.team_id}/roster/new`}
            className="text-sm text-brand-700 hover:underline mt-1 inline-block"
          >
            Add players →
          </Link>
        </div>
      ) : (
        <LineupBuilder
          gameId={params.gameId}
          players={players}
          existingLineup={existingLineup}
        />
      )}
    </div>
  );
}
