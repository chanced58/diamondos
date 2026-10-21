import React, { useEffect, useState } from 'react';
import { AppState, Platform, type AppStateStatus } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { QueryClient, QueryClientProvider, focusManager, onlineManager } from '@tanstack/react-query';
import { isPermanentApiError } from '../lib/api-client';
import { useAuth } from './AuthProvider';

/**
 * React Query for the app's online-only reads and mutations (the offline-
 * first data — scoring, lineups, roster, messages — stays in WatermelonDB).
 *
 * Wires React Query to React Native: "window focus" is the app returning to
 * the foreground, and "online" comes from NetInfo, so queries pause while
 * offline and refetch when the connection or the app comes back.
 */

const MAX_RETRIES = 2;

export function createAppQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: (failureCount, error) => !isPermanentApiError(error) && failureCount < MAX_RETRIES,
      },
      mutations: { retry: false },
    },
  });
}

onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((state) => {
    setOnline(state.isConnected !== false);
  }),
);

function onAppStateChange(status: AppStateStatus) {
  if (Platform.OS !== 'web') focusManager.setFocused(status === 'active');
}

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(createAppQueryClient);
  const { user } = useAuth();

  useEffect(() => {
    const subscription = AppState.addEventListener('change', onAppStateChange);
    return () => subscription.remove();
  }, []);

  // Cached responses belong to the user who fetched them: drop them on
  // sign-out or a switch of account.
  useEffect(() => {
    queryClient.clear();
  }, [queryClient, user?.id]);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
