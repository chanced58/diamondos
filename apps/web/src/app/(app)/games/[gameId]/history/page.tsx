import type { JSX } from 'react';
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { getUserAccess } from '@/lib/user-access';
import { weAreHome, buildGameHistoryTree, applyPitchRevertedTyped } from '@baseball/shared';
import type { GameEvent, EventType } from '@baseball/shared';
import { GameHistoryTree } from '@/components/game/GameHistoryTree';
import { RecalculateScoresForm } from '../GameDetailClient';

export const metadata: Metadata = { title: 'Game History' };

export default async function GameHistoryPage({
  params,
}: {
  params: { gameId: string };
}): Promise<JSX.Element | null> {
  const auth = createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return null;

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: game } = await db
    .from('games')
    .select('id, team_id, opponent_name, location_type, neutral_home_team, status, home_score, away_score, opponent_team_id')
    .eq('id', params.gameId)
    .single();

  if (!game) notFound();

  const { isCoach, isPlatformAdmin } = await getUserAccess(game.team_id, user.id);

  if (!isCoach && !isPlatformAdmin) {
    const { data: membership } = await db
      .from('team_members')
      .select('role')
      .eq('team_id', game.team_id)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single();
    if (!membership) notFound();
  }

  // Only show history for games that have been started
  if (['scheduled', 'cancelled', 'postponed'].includes(game.status)) {
    return (
      <div className="p-8 max-w-2xl">
        <Link href={`/games/${params.gameId}`} className="text-sm text-brand-700 hover:underline">
          ← Back to game
        </Link>
        <p className="mt-6 text-gray-500">Game history is available once the game has started.</p>
      </div>
    );
  }

  const [eventsResult, rosterResult, teamResult, opponentPlayersResult, lineupResult, opponentLineupResult] =
    await Promise.all([
      db
        .from('game_events')
        .select('*')
        .eq('game_id', params.gameId)
        .order('sequence_number'),
      db
        .from('players')
        .select('id, first_name, last_name, jersey_number')
        .eq('team_id', game.team_id)
        .order('last_name'),
      db.from('teams').select('*').eq('id', game.team_id).single(),
      game.opponent_team_id
        ? db
            .from('opponent_players')
            .select('id, first_name, last_name, jersey_number')
            .eq('opponent_team_id', game.opponent_team_id)
            .order('last_name')
        : Promise.resolve({ data: [] as { id: string; first_name: string; last_name: string; jersey_number: string | null }[] }),
      db
        .from('game_lineups')
        .select('player_id, batting_order, starting_position, players(id, first_name, last_name, jersey_number)')
        .eq('game_id', params.gameId)
        .order('batting_order', { ascending: true, nullsFirst: false }),
      game.opponent_team_id
        ? db
            .from('opponent_game_lineups')
            .select('opponent_player_id, batting_order, starting_position, opponent_players(id, first_name, last_name, jersey_number)')
            .eq('game_id', params.gameId)
            .order('batting_order', { ascending: true, nullsFirst: false })
        : Promise.resolve({ data: [] as { opponent_player_id: string; batting_order: number | null; starting_position: string | null; opponent_players: unknown }[] }),
    ]);

  const teamName = teamResult.data?.name ?? 'Our Team';

  // Build unified player name map
  const playerNameMap = new Map<string, string>();

  // Our roster
  for (const p of (rosterResult.data ?? [])) {
    playerNameMap.set(p.id, `${p.first_name} ${p.last_name}`);
  }

  // Our lineup (may include players not in roster query)
  for (const l of (lineupResult.data ?? [])) {
    const p = l.players as unknown as { id: string; first_name: string; last_name: string } | null;
    if (p && !playerNameMap.has(p.id)) {
      playerNameMap.set(p.id, `${p.first_name} ${p.last_name}`);
    }
  }

  // Opponent roster
  for (const p of (opponentPlayersResult.data ?? [])) {
    playerNameMap.set(p.id, `${p.first_name} ${p.last_name}`);
  }

  // Opponent lineup
  for (const l of (opponentLineupResult.data ?? [])) {
    const p = l.opponent_players as unknown as { id: string; first_name: string; last_name: string } | null;
    if (p && !playerNameMap.has(p.id)) {
      playerNameMap.set(p.id, `${p.first_name} ${p.last_name}`);
    }
  }

  // Filter out reverted events and handle game_reset boundary
  const allEvents = (eventsResult.data ?? []) as Record<string, unknown>[];
  const lastResetIndex = allEvents.map((e) => e.event_type).lastIndexOf('game_reset');
  const activeEvents = lastResetIndex === -1 ? allEvents : allEvents.slice(lastResetIndex + 1);

  // Convert DB rows to GameEvent shape for shared utility
  const gameEvents: GameEvent[] = activeEvents.map((e) => ({
    id: e.id as string,
    gameId: e.game_id as string,
    sequenceNumber: e.sequence_number as number,
    eventType: e.event_type as EventType,
    inning: e.inning as number,
    isTopOfInning: e.is_top_of_inning as boolean,
    payload: (e.payload ?? {}) as GameEvent['payload'],
    occurredAt: e.occurred_at as string,
    createdBy: e.created_by as string,
    deviceId: e.device_id as string,
    syncedAt: e.synced_at as string | undefined,
  }));

  const effectiveEvents = applyPitchRevertedTyped(gameEvents);
  const tree = buildGameHistoryTree(effectiveEvents, playerNameMap);
  const isHome = weAreHome(game.location_type, game.neutral_home_team);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-gray-200 bg-white">
        <Link href={`/games/${params.gameId}`} className="text-sm text-brand-700 hover:underline">
          ← Back to game
        </Link>
        <div className="flex items-center justify-between mt-2">
          <h1 className="text-lg font-bold text-gray-900">
            {teamName} vs {game.opponent_name}
          </h1>
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold text-gray-900">
              {isHome
                ? `${game.home_score ?? 0} – ${game.away_score ?? 0}`
                : `${game.away_score ?? 0} – ${game.home_score ?? 0}`}
            </span>
            <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
              game.status === 'completed'
                ? 'bg-gray-100 text-gray-600'
                : 'bg-green-100 text-green-700'
            }`}>
              {game.status === 'completed' ? 'Final' : 'Live'}
            </span>
          </div>
        </div>
        <p className="text-sm text-gray-500 mt-1">Play-by-Play History</p>
      </div>

      {/* Recalculate (coaches only) */}
      {isCoach && (
        <div className="px-4 pt-3">
          <RecalculateScoresForm gameId={game.id} />
        </div>
      )}

      {/* Tree */}
      <div className="flex-1 overflow-auto p-4">
        <GameHistoryTree
          tree={tree}
          teamName={teamName}
          opponentName={game.opponent_name}
          isHome={isHome}
          isCoach={isCoach}
          gameId={game.id}
        />
      </div>
    </div>
  );
}
