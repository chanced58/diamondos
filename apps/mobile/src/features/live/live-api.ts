import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { liveGameResponseSchema, type LiveGameResponse } from '@baseball/shared';
import { apiClient, type ApiClient } from '../../lib/api-client';
import { getSupabaseClient } from '../../lib/supabase';
import { mergeEvent, type GameEventRow } from './live-model';

/**
 * The live viewer's data: the starting payload from
 * `/api/m/v1/games/:gameId/live`, then new events over Supabase Realtime
 * (the same subscription as the web /live page). Online-only.
 */

export const liveGameQueryKey = (gameId: string) => ['games', gameId, 'live'] as const;

/** A backstop in case Realtime drops without saying so. */
const LIVE_REFRESH_MS = 30_000;

export function fetchLiveGame(gameId: string, client: ApiClient = apiClient): Promise<LiveGameResponse> {
  return client.get(`/games/${encodeURIComponent(gameId)}/live`, liveGameResponseSchema);
}

export function useLiveGame(gameId: string) {
  const queryClient = useQueryClient();
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const query = useQuery({
    queryKey: liveGameQueryKey(gameId),
    queryFn: () => fetchLiveGame(gameId),
    enabled: gameId.length > 0,
    refetchInterval: (q) => (q.state.data?.game.status === 'in_progress' ? LIVE_REFRESH_MS : false),
  });
  const isLive = query.data?.game.status === 'in_progress';

  useEffect(() => {
    if (!gameId || !isLive) return;
    const key = liveGameQueryKey(gameId);
    const supabase = getSupabaseClient();
    const channel = supabase
      .channel(`live-game-${gameId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'game_events', filter: `game_id=eq.${gameId}` },
        (payload) => {
          queryClient.setQueryData<LiveGameResponse>(key, (current) =>
            current ? mergeEvent(current, payload.new as GameEventRow) : current,
          );
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameId}` },
        () => void queryClient.invalidateQueries({ queryKey: key }),
      )
      .subscribe((status) => {
        const connected = status === 'SUBSCRIBED';
        setRealtimeConnected(connected);
        // Events written between the first load and the subscription never
        // arrive over Realtime; one refetch closes that gap.
        if (connected) void queryClient.invalidateQueries({ queryKey: key });
      });

    return () => {
      setRealtimeConnected(false);
      void supabase.removeChannel(channel);
    };
  }, [gameId, isLive, queryClient]);

  return { ...query, realtimeConnected };
}
