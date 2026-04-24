'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@/lib/supabase/client';

interface RealtimeHistoryRefreshProps {
  gameId: string;
  /**
   * When the game is completed, new events shouldn't arrive — subscribing
   * would cost a connection for no benefit. Pass `false` to skip the
   * subscription entirely (initial server render still shows everything).
   */
  enabled?: boolean;
}

/**
 * Subscribes to Supabase Realtime for game_events INSERT on the given game
 * and triggers a server-side refresh (re-fetch + re-render) whenever a new
 * event arrives. Keeps the tree-building logic on the server while making
 * the history view auto-update for all connected viewers.
 *
 * Renders nothing — this component exists purely for its side effect.
 */
export function RealtimeHistoryRefresh({
  gameId,
  enabled = true,
}: RealtimeHistoryRefreshProps): null {
  const router = useRouter();
  const supabase = createBrowserClient();

  useEffect(() => {
    if (!enabled) return;

    const channel = supabase
      .channel(`game-events-history-${gameId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'game_events',
          filter: `game_id=eq.${gameId}`,
        },
        () => {
          // `router.refresh()` re-runs the server component and streams the
          // new HTML. Next.js dedupes concurrent refresh calls so rapid-fire
          // events (e.g. a batter seeing 6 pitches in a row) don't storm
          // the server; the net effect is at most one refetch per micro-task.
          router.refresh();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [gameId, enabled, router, supabase]);

  return null;
}
