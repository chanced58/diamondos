import type { JSX } from 'react';
import { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { getUserAccess } from '@/lib/user-access';
import { ScoringBoard } from './ScoringBoard';

export const metadata: Metadata = { title: 'Scoring' };

/** Map database enum values to UI abbreviations. */
const DB_TO_POSITION: Record<string, string> = {
  pitcher: 'P', catcher: 'C', first_base: '1B', second_base: '2B',
  third_base: '3B', shortstop: 'SS', left_field: 'LF', center_field: 'CF',
  right_field: 'RF', designated_hitter: 'DH', infield: 'IF', outfield: 'OF',
  utility: 'UTIL',
};

export default async function ScorePage({ params }: { params: { gameId: string } }): Promise<JSX.Element | null> {
  const auth = createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return null;

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: game } = await db
    .from('games')
    .select('id, team_id, opponent_name, location_type, status, home_score, away_score, season_id, opponent_team_id')
    .eq('id', params.gameId)
    .single();

  if (!game) notFound();

  const { isCoach, isPlatformAdmin } = await getUserAccess(game.team_id, user.id);

  // Non-admin users must be team members to view
  if (!isCoach && !isPlatformAdmin) {
    const { data: membership } = await db
      .from('team_members')
      .select('role')
      .eq('team_id', game.team_id)
      .eq('user_id', user.id)
      .single();
    if (!membership) notFound();
  }

  // Must be in_progress to score
  if (game.status === 'scheduled') redirect(`/games/${params.gameId}`);
  if (game.status === 'completed' || game.status === 'cancelled') redirect(`/games/${params.gameId}`);

  const [lineupResult, eventsResult, rosterResult, opponentPlayersResult, opponentLineupResult] = await Promise.all([
    db
      .from('game_lineups')
      .select('player_id, batting_order, starting_position, players(id, first_name, last_name, jersey_number)')
      .eq('game_id', params.gameId)
      .order('batting_order', { ascending: true, nullsFirst: false }),
    db
      .from('game_events')
      .select('*')
      .eq('game_id', params.gameId)
      .order('sequence_number'),
    db
      .from('players')
      .select('id, first_name, last_name, jersey_number')
      .eq('team_id', game.team_id)
      .eq('is_active', true)
      .order('last_name'),
    game.opponent_team_id
      ? db
          .from('opponent_players')
          .select('id, first_name, last_name, jersey_number')
          .eq('opponent_team_id', game.opponent_team_id)
          .eq('is_active', true)
          .order('last_name')
      : Promise.resolve({ data: [] as { id: string; first_name: string; last_name: string; jersey_number: string | null }[] }),
    game.opponent_team_id
      ? db
          .from('opponent_game_lineups')
          .select('opponent_player_id, batting_order, starting_position, opponent_players(id, first_name, last_name, jersey_number)')
          .eq('game_id', params.gameId)
          .order('batting_order', { ascending: true, nullsFirst: false })
      : Promise.resolve({ data: [] as { opponent_player_id: string; batting_order: number | null; starting_position: string | null; opponent_players: unknown }[] }),
  ]);

  const lineup = (lineupResult.data ?? []).map((l) => {
    const p = l.players as unknown as { id: string; first_name: string; last_name: string; jersey_number: number | null } | null;
    return {
      playerId: l.player_id as string,
      // batting_order is NULL for pitchers who don't bat (DH rule); map to 0 so they are
      // excluded from the 1–9 starters rotation but remain in the player-name lookup.
      battingOrder: (l.batting_order as number | null) ?? 0,
      startingPosition: l.starting_position ? DB_TO_POSITION[l.starting_position] ?? l.starting_position : null,
      player: {
        id: p?.id ?? null,
        firstName: p?.first_name ?? '',
        lastName: p?.last_name ?? '',
        jerseyNumber: p?.jersey_number ?? null,
      },
    };
  });

  const opponentLineup = (opponentLineupResult.data ?? []).map((l) => {
    const p = l.opponent_players as unknown as { id: string; first_name: string; last_name: string; jersey_number: string | null } | null;
    return {
      playerId: l.opponent_player_id as string,
      battingOrder: (l.batting_order as number | null) ?? 0,
      startingPosition: l.starting_position ? DB_TO_POSITION[l.starting_position] ?? l.starting_position : null,
      player: {
        id: p?.id ?? null,
        firstName: p?.first_name ?? '',
        lastName: p?.last_name ?? '',
        jerseyNumber: p?.jersey_number ?? null,
      },
    };
  });

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

    const completedIds = (completedGames ?? []).map((g) => g.id as string);

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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- game event rows from Supabase
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

  const teamRoster = (rosterResult.data ?? []).map((p) => ({
    id: p.id,
    firstName: p.first_name,
    lastName: p.last_name,
    jerseyNumber: p.jersey_number ?? null,
  }));

  const opponentRoster = (opponentPlayersResult.data ?? []).map((p) => ({
    id: p.id,
    firstName: p.first_name,
    lastName: p.last_name,
    jerseyNumber: p.jersey_number ?? null,
  }));

  // ── Filter events to only those in the current "game session" ───────────────
  // If the game has been reset, a game_reset event marks the boundary. Only
  // replay events after the most recent reset so ScoringBoard starts clean.
  const allEvents = eventsResult.data ?? [];
  const lastResetIndex = allEvents.map((e) => e.event_type).lastIndexOf('game_reset');
  const activeEvents = lastResetIndex === -1 ? allEvents : allEvents.slice(lastResetIndex + 1);

  // ── Scoring config — read from the game_start event payload ─────────────────
  // Defaults to all-enabled for games started before this feature shipped.
  const gameStartEvent = activeEvents.find((e) => e.event_type === 'game_start');
  const gsp = (gameStartEvent?.payload ?? {}) as Record<string, unknown>;
  const scoringConfig = {
    pitchType:     gsp.pitchTypeEnabled     !== false,
    pitchLocation: gsp.pitchLocationEnabled !== false,
    sprayChart:    gsp.sprayChartEnabled    !== false,
  };

  return (
    <ScoringBoard
      game={{
        id: game.id,
        opponentName: game.opponent_name,
        locationType: game.location_type,
        teamId: game.team_id,
      }}
      lineup={lineup}
      opponentLineup={opponentLineup}
      teamRoster={teamRoster}
      opponentRoster={opponentRoster}
      initialEvents={activeEvents}
      currentUserId={user.id}
      isCoach={isCoach}
      seasonSprayPoints={seasonSprayPoints}
      scoringConfig={scoringConfig}
    />
  );
}
