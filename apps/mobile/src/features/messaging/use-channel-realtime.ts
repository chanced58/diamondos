import { useCallback, useEffect, useRef, useState } from 'react';
import { getSupabaseClient } from '../../lib/supabase';
import { useSyncContext } from '../../providers/SyncProvider';

/**
 * Live updates for an open team channel. Messages live in WatermelonDB and
 * reach it through the sync pull, so a message posted or deleted in this
 * channel elsewhere (Supabase Realtime, which RLS opens to channel members)
 * asks for a sync rather than writing the row itself — one path for every
 * message, offline queue included.
 *
 * A sync already running drops new requests, so a change that lands
 * mid-sync is kept as one follow-up sync, run once the current one ends.
 */
export function useChannelRealtime(channelId: string): { requestSync: () => void } {
  const { isSyncing, triggerSync } = useSyncContext();
  const [pending, setPending] = useState(false);
  const triggerRef = useRef(triggerSync);
  triggerRef.current = triggerSync;

  const requestSync = useCallback(() => setPending(true), []);

  useEffect(() => {
    if (!pending || isSyncing) return;
    setPending(false);
    void triggerRef.current();
  }, [pending, isSyncing]);

  useEffect(() => {
    if (!channelId) return;
    const supabase = getSupabaseClient();
    const filter = `channel_id=eq.${channelId}`;
    const channel = supabase
      .channel(`messages-${channelId}`)
      // A new message, and a deletion (deleted_at is an update).
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter }, requestSync)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter }, requestSync)
      .subscribe((status) => {
        // Anything posted before the subscription opened.
        if (status === 'SUBSCRIBED') requestSync();
      });
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [channelId, requestSync]);

  return { requestSync };
}
