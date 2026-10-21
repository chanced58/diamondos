import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AuthProvider, useAuth } from '../AuthProvider';
import { unregisterPushToken } from '../../lib/notifications';
import { clearCachedMe } from '../../features/teams/me';

const mockSignOut = jest.fn(async () => ({ error: null }));

jest.mock('../../lib/supabase', () => ({
  getSupabaseClient: () => ({
    auth: {
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: jest.fn() } } }),
      signOut: () => mockSignOut(),
    },
  }),
}));
jest.mock('../../lib/notifications', () => ({ unregisterPushToken: jest.fn() }));
jest.mock('../../features/teams/me', () => ({ clearCachedMe: jest.fn() }));

const wrapper = ({ children }: { children: React.ReactNode }) => <AuthProvider>{children}</AuthProvider>;

describe('AuthProvider signOut', () => {
  beforeEach(() => jest.clearAllMocks());

  it('cleans up the device before ending the session', async () => {
    const order: string[] = [];
    (unregisterPushToken as jest.Mock).mockImplementation(async () => { order.push('push'); });
    (clearCachedMe as jest.Mock).mockImplementation(async () => { order.push('me'); });
    mockSignOut.mockImplementation(async () => { order.push('signOut'); return { error: null }; });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.signOut(); });

    expect(order).toEqual(['push', 'me', 'signOut']);
  });

  it('still signs out when the cleanup hangs on a bad network', async () => {
    (unregisterPushToken as jest.Mock).mockReturnValue(new Promise(() => {}));
    (clearCachedMe as jest.Mock).mockResolvedValue(undefined);

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    jest.useFakeTimers();
    try {
      let done = false;
      act(() => { void result.current.signOut().then(() => { done = true; }); });
      await act(async () => { jest.advanceTimersByTime(5_000); });
      await waitFor(() => expect(done).toBe(true));
      expect(mockSignOut).toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });
});
