import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import { RoleProvider, useRole } from '../RoleProvider';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
}));
jest.mock('../AuthProvider', () => ({ useAuth: () => ({ user: { id: 'coach' } }) }));

const memberRows = [
  { team_id: 'regular', role: 'head_coach', teams: { name: 'Huskies' } },
  { team_id: 'cup-team', role: 'head_coach', teams: { name: 'Idaho Natives' } },
];
let resolveTournamentTeams: (value: { data: unknown[]; error: null }) => void = () => {};

function mockQuery(result: Promise<unknown>) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    in: () => result,
    then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
      result.then(onFulfilled, onRejected),
  };
  return chain;
}

jest.mock('../../lib/supabase', () => ({
  getSupabaseClient: () => ({
    from: (table: string) => {
      if (table === 'team_members') return mockQuery(Promise.resolve({ data: memberRows, error: null }));
      if (table === 'players') return mockQuery(Promise.resolve({ data: [], error: null }));
      return mockQuery(new Promise((resolve) => { resolveTournamentTeams = resolve; }));
    },
  }),
}));

const wrapper = ({ children }: { children: React.ReactNode }) => <RoleProvider>{children}</RoleProvider>;

describe('RoleProvider', () => {
  it('publishes teams without waiting for the optional tournament-team tags', async () => {
    const { result } = renderHook(() => useRole(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.memberships.map((m) => [m.teamId, m.isTournamentTeam])).toEqual([
      ['regular', false],
      ['cup-team', false],
    ]);

    await act(async () => resolveTournamentTeams({ data: [{ team_id: 'cup-team' }], error: null }));
    await waitFor(() =>
      expect(result.current.memberships.find((m) => m.teamId === 'cup-team')?.isTournamentTeam).toBe(true),
    );
    expect(result.current.activeTeam?.teamId).toBe('regular');
  });

  it('still switches teams when saving the choice on the device fails', async () => {
    (SecureStore.setItemAsync as jest.Mock).mockRejectedValueOnce(new Error('keychain locked'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const { result } = renderHook(() => useRole(), { wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));
      await act(async () => { await result.current.setActiveTeamId('cup-team'); });
      expect(result.current.activeTeam?.teamId).toBe('cup-team');
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('could not save active team'), expect.any(Error));
    } finally {
      warn.mockRestore();
    }
  });
});
