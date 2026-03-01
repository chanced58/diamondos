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
  // Fetch pitch_thrown + hit events for completed games and replay them to
  // record the ball-strike count at the time of each batted ball.  The count
  // is used on the scoring board to filter the spray chart by the live count.
  type SprayPoint = { x: number; y: number; balls: number; strikes: number };
  const seasonSprayPoints: Record<string, SprayPoint[]> = {};

  const playerIds = lineup.map((l) => l.playerId);

  if (playerIds.length > 0 && game.season_id) {
    const { data: completedGames } = await db
      .from('games')
      .select('id')
      .eq('team_id', game.team_id)
      .eq('season_id', game.season_id)
      .eq('status', 'completed')
      .neq('id', params.gameId);

    const completedIds = (completedGames ?? []).map((g: any) => g.id as string);

    if (completedIds.length > 0) {
      const { data: rawEvents } = await db
        .from('game_events')
        .select('game_id, sequence_number, event_type, payload')
        .in('game_id', completedIds)
        .in('event_type', [
          'pitch_thrown', 'hit', 'walk', 'strikeout', 'out',
          'hit_by_pitch', 'inning_change', 'sacrifice_fly',
          'sacrifice_bunt', 'field_error', 'double_play',
        ])
        .order('game_id')
        .order('sequence_number');

      // Group events by game so we can replay each game independently
      const byGame = new Map<string, any[]>();
      for (const e of rawEvents ?? []) {
        const gid = e.game_id as string;
        if (!byGame.has(gid)) byGame.set(gid, []);
        byGame.get(gid)!.push(e);
      }

      // Replay each game's events to derive count at the time of each contact
      for (const gameEvts of byGame.values()) {
        let balls = 0, strikes = 0;
        let prevBatterId: string | null = null;
        let contactCount: { balls: number; strikes: number } | null = null;

        for (const event of gameEvts) {
          const etype = event.event_type as string;
          const p = (event.payload ?? {}) as Record<string, unknown>;

          if (etype === 'pitch_thrown') {
            const bid = p.batterId as string;
            if (bid !== prevBatterId) {
              // New batter — reset count
              balls = 0; strikes = 0; prevBatterId = bid; contactCount = null;
            }
            const outcome = p.outcome as string;
            if (outcome === 'in_play') {
              contactCount = { balls, strikes }; // count when ball was put in play
            } else if (outcome === 'ball' || outcome === 'intentional_ball') {
              if (balls < 3) balls++;
            } else if (
              outcome === 'called_strike' ||
              outcome === 'swinging_strike' ||
              outcome === 'foul_tip'
            ) {
              if (strikes < 2) strikes++;
            } else if (outcome === 'foul') {
              if (strikes < 2) strikes++;
            }
          } else if (etype === 'hit') {
            const bid = p.batterId as string | undefined;
            const sprayX = p.sprayX as number | null | undefined;
            if (sprayX != null && bid && playerIds.includes(bid) && contactCount) {
              (seasonSprayPoints[bid] ??= []).push({
                x: sprayX,
                y: (p.sprayY as number) ?? 0,
                balls: contactCount.balls,
                strikes: contactCount.strikes,
              });
            }
            balls = 0; strikes = 0; prevBatterId = null; contactCount = null;
          } else {
            // Terminal or inning-reset events — clear count state
            balls = 0; strikes = 0; prevBatterId = null; contactCount = null;
          }
        }
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
