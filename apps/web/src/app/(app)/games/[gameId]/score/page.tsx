import { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { ScoringBoard } from './ScoringBoard';

export const metadata: Metadata = { title: 'Scoring' };

export default async function ScorePage({ params }: { params: { gameId: string } }) {
  const auth = createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return null;

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: game } = await db
    .from('games')
    .select('id, team_id, opponent_name, location_type, status, home_score, away_score, season_id')
    .eq('id', params.gameId)
    .single();

  if (!game) notFound();

  const { data: membership } = await db
    .from('team_members')
    .select('role')
    .eq('team_id', game.team_id)
    .eq('user_id', user.id)
    .single();

  if (!membership) notFound();

  // Must be in_progress to score
  if (game.status === 'scheduled') redirect(`/games/${params.gameId}`);
  if (game.status === 'completed' || game.status === 'cancelled') redirect(`/games/${params.gameId}`);

  const isCoach =
    membership.role === 'head_coach' ||
    membership.role === 'assistant_coach' ||
    membership.role === 'athletic_director';

  const [lineupResult, eventsResult] = await Promise.all([
    db
      .from('game_lineups')
      .select('player_id, batting_order, starting_position, players(id, first_name, last_name, jersey_number)')
      .eq('game_id', params.gameId)
      .order('batting_order'),
    db
      .from('game_events')
      .select('*')
      .eq('game_id', params.gameId)
      .order('sequence_number'),
  ]);

  const lineup = (lineupResult.data ?? []).map((l: any) => ({
    playerId: l.player_id as string,
    battingOrder: l.batting_order as number,
    startingPosition: l.starting_position as string | null,
    player: {
      id: (l.players as any)?.id as string,
      firstName: (l.players as any)?.first_name as string,
      lastName: (l.players as any)?.last_name as string,
      jerseyNumber: (l.players as any)?.jersey_number as number | null,
    },
  }));

  // ── Season spray-chart history ──────────────────────────────────────────────
  // Fetch hit events with spray coordinates from all completed games this season
  // so the tendency chart reflects the batter's full-season hitting profile.
  const seasonSprayPoints: Record<string, { x: number; y: number }[]> = {};

  const playerIds = lineup.map((l) => l.playerId);

  if (playerIds.length > 0 && game.season_id) {
    const { data: completedGames } = await db
      .from('games')
      .select('id')
      .eq('team_id', game.team_id)
      .eq('season_id', game.season_id)
      .eq('status', 'completed')
      .neq('id', params.gameId); // current game's hits come from eventsResult

    const completedIds = (completedGames ?? []).map((g: any) => g.id as string);

    if (completedIds.length > 0) {
      const { data: hitEvents } = await db
        .from('game_events')
        .select('payload')
        .in('game_id', completedIds)
        .eq('event_type', 'hit');

      for (const event of hitEvents ?? []) {
        const p = (event.payload ?? {}) as Record<string, unknown>;
        if (p.sprayX == null || p.batterId == null) continue;
        const bid = p.batterId as string;
        if (!playerIds.includes(bid)) continue;
        (seasonSprayPoints[bid] ??= []).push({
          x: p.sprayX as number,
          y: p.sprayY as number,
        });
      }
    }
  }

  return (
    <ScoringBoard
      game={{
        id: game.id,
        opponentName: game.opponent_name,
        locationType: game.location_type,
        teamId: game.team_id,
      }}
      lineup={lineup}
      initialEvents={eventsResult.data ?? []}
      currentUserId={user.id}
      isCoach={isCoach}
      seasonSprayPoints={seasonSprayPoints}
    />
  );
}
