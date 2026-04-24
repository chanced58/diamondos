'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@/lib/supabase/client';

/** Trailing-edge debounce window — bursts of events within this window
 *  collapse into one refresh. 250ms keeps the UI feeling live while
 *  still coalescing rapid-fire inserts (e.g. a full PA of pitches). */
const REFRESH_DEBOUNCE_MS = 250;

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
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
          // Each INSERT fires its own handler, so a rapid burst of events
          // (e.g. one full plate appearance = pitch + pitch + ... + outcome)
          // would otherwise trigger N server refetches. Coalesce via a
          // trailing-edge timer: the latest event wins, and we refresh
          // once REFRESH_DEBOUNCE_MS after activity settles.
          if (debounceTimer.current) clearTimeout(debounceTimer.current);
          debounceTimer.current = setTimeout(() => {
            debounceTimer.current = null;
            router.refresh();
          }, REFRESH_DEBOUNCE_MS);
        },
      )
      .subscribe();

    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
        debounceTimer.current = null;
      }
      supabase.removeChannel(channel);
    };
  }, [gameId, enabled, router, supabase]);

  return null;
}
