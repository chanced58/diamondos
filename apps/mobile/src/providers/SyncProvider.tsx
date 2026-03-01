import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { syncWithSupabase } from '../sync/sync-engine';
import { getSupabaseClient } from '../lib/supabase';

interface SyncContextValue {
  isSyncing: boolean;
  lastSyncedAt: number | null;
  triggerSync: () => Promise<void>;
}

const SyncContext = createContext<SyncContextValue>({
  isSyncing: false,
  lastSyncedAt: null,
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
 */
export function SyncProvider({ children }: { children: React.ReactNode }) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
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
    } catch (error) {
      console.warn('Sync failed:', error);
      // Silent failure — will retry on next network event or interval
    } finally {
      setIsSyncing(false);
      syncLockRef.current = false;
    }
  };

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
    <SyncContext.Provider value={{ isSyncing, lastSyncedAt, triggerSync }}>
      {children}
    </SyncContext.Provider>
  );
}
