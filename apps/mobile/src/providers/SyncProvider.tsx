import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { Q } from '@nozbe/watermelondb';
import { syncWithSupabase } from '../sync/sync-engine';
import { getSupabaseClient } from '../lib/supabase';
import { database } from '../db';
import type { GameEvent } from '../db/models/GameEvent';

interface SyncContextValue {
  isSyncing: boolean;
  lastSyncedAt: number | null;
  lastSyncError: Error | null;
  pendingEventsCount: number;
  triggerSync: () => Promise<void>;
}

const SyncContext = createContext<SyncContextValue>({
  isSyncing: false,
  lastSyncedAt: null,
  lastSyncError: null,
  pendingEventsCount: 0,
  triggerSync: async () => {},
});

export function useSyncContext() {
  return useContext(SyncContext);
}

/**
 * Provides background sync orchestration.
 * - Triggers sync when network becomes available (was offline → online)
 * - Triggers sync every 30 seconds when online and a game is in progress
 * - Exposes a manual triggerSync() for use in the scoring screen after each event
 * - Surfaces sync failures and pending-event counts so the UI can alert the
 *   scorer when events have not yet reached Supabase.
 */
export function SyncProvider({ children }: { children: React.ReactNode }) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [lastSyncError, setLastSyncError] = useState<Error | null>(null);
  const [pendingEventsCount, setPendingEventsCount] = useState(0);
  const wasOfflineRef = useRef(false);
  const syncLockRef = useRef(false);

  const triggerSync = async () => {
    if (syncLockRef.current) return;
    syncLockRef.current = true;
    setIsSyncing(true);

    try {
      const supabase = getSupabaseClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      await syncWithSupabase();
      setLastSyncedAt(Date.now());
      setLastSyncError(null);
    } catch (error) {
      console.warn('Sync failed:', error);
      setLastSyncError(error instanceof Error ? error : new Error(String(error)));
    } finally {
      setIsSyncing(false);
      syncLockRef.current = false;
    }
  };

  // Observe count of locally-created events not yet acked by Supabase.
  // A non-zero count means either a sync is pending or sync has failed —
  // in either case the scorer should be able to see it.
  useEffect(() => {
    const collection = database.get<GameEvent>('game_events');
    const subscription = collection
      .query(Q.where('synced_at', null))
      .observeCount()
      .subscribe(setPendingEventsCount);
    return () => subscription.unsubscribe();
  }, []);

  // Sync when network is restored after being offline
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const isConnected = state.isConnected && state.isInternetReachable;

      if (wasOfflineRef.current && isConnected) {
        triggerSync();
      }

      wasOfflineRef.current = !isConnected;
    });

    return unsubscribe;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Periodic sync every 30 seconds when app is active
  useEffect(() => {
    const interval = setInterval(() => {
      NetInfo.fetch().then((state) => {
        if (state.isConnected && state.isInternetReachable) {
          triggerSync();
        }
      });
    }, 30_000);

    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <SyncContext.Provider value={{ isSyncing, lastSyncedAt, lastSyncError, pendingEventsCount, triggerSync }}>
      {children}
    </SyncContext.Provider>
  );
}
