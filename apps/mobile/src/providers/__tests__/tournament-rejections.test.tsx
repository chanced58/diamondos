import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { SyncProvider, useSyncContext } from '../SyncProvider';
import { syncWithSupabase } from '../../sync/sync-engine';

jest.mock('../../sync/sync-engine', () => ({
  syncWithSupabase: jest.fn(),
  getTournamentSyncRejections: async () => [{ gameId: 'one', eventId: 'bad', reason: 'Cap reached' }],
}));
jest.mock('@react-native-community/netinfo', () => ({
  fetch: async () => ({ isConnected: false, isInternetReachable: false }),
  addEventListener: () => () => {},
}));
jest.mock('../../lib/supabase', () => ({ getSupabaseClient: () => ({ auth: {
  onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
} }) }));
jest.mock('../../db', () => ({ database: { get: () => ({ query: () => ({ observeCount: () => ({
  subscribe: () => ({ unsubscribe: () => {} }),
}) }) }) } }));

it('restores persisted rejection guards on an offline cold start before enabling scoring', async () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => <SyncProvider>{children}</SyncProvider>;
  const { result } = renderHook(() => useSyncContext(), { wrapper });
  await waitFor(() => expect(result.current.tournamentRejectionsLoaded).toBe(true));
  expect(result.current.tournamentRejections).toEqual([{ gameId: 'one', eventId: 'bad', reason: 'Cap reached' }]);
  expect(syncWithSupabase).not.toHaveBeenCalled();
});
