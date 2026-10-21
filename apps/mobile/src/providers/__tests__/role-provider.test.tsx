import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import { Feature, SubscriptionTier, type MeResponse } from '@baseball/shared';
import { RoleProvider, useCan, useRole } from '../RoleProvider';
import { notifyTeamMembershipChange } from '../../sync/team-backfill';
import { ApiError } from '../../lib/api-client';
import { fetchMe, readCachedMe, writeCachedMe } from '../../features/teams/me';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
}));
jest.mock('../AuthProvider', () => ({ useAuth: () => ({ user: { id: 'coach' } }) }));
jest.mock('../../features/teams/me', () => ({
  fetchMe: jest.fn(),
  readCachedMe: jest.fn(),
  writeCachedMe: jest.fn(),
}));

const mockFetchMe = fetchMe as jest.Mock;
const mockReadCachedMe = readCachedMe as jest.Mock;
const mockWriteCachedMe = writeCachedMe as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  // Default: no web API in this build, nothing cached — the direct-read fallback.
  mockFetchMe.mockRejectedValue(new ApiError('not_configured', 'EXPO_PUBLIC_API_BASE_URL is not set'));
  mockReadCachedMe.mockResolvedValue(null);
});

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

describe('RoleProvider (direct-read fallback)', () => {
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

  it('reloads the team list when the sync reports a joined team, keeping the selection and no spinner', async () => {
    const loadingHistory: boolean[] = [];
    const { result } = renderHook(() => {
      const role = useRole();
      loadingHistory.push(role.loading);
      return role;
    }, { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.setActiveTeamId('cup-team'); });
    const settledAt = loadingHistory.length;

    memberRows.push({ team_id: 'joined-team', role: 'assistant_coach', teams: { name: 'Joined' } });
    try {
      await act(async () => notifyTeamMembershipChange());
      await waitFor(() =>
        expect(result.current.memberships.map((m) => m.teamId)).toEqual(['regular', 'cup-team', 'joined-team']),
      );
      expect(result.current.activeTeam?.teamId).toBe('cup-team');
      expect(loadingHistory.slice(settledAt)).not.toContain(true);
    } finally {
      memberRows.pop();
    }
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

function mePayload(overrides: Partial<MeResponse> = {}): MeResponse {
  return {
    apiVersion: 1,
    user: { id: 'coach', email: 'coach@example.com', firstName: null, lastName: null },
    memberships: [
      {
        teamId: 'regular', teamName: 'Huskies', organization: null, role: 'head_coach',
        playerId: null, isTournamentTeam: false, tier: SubscriptionTier.STARTER,
        features: [Feature.DIRECT_MESSAGES],
      },
      {
        teamId: 'cup-team', teamName: 'Idaho Natives', organization: null, role: 'assistant_coach',
        playerId: null, isTournamentTeam: true, tier: SubscriptionTier.FREE, features: [],
      },
    ],
    leagueRoles: [{ leagueId: 'l1', leagueName: 'Metro', leagueSlug: 'metro', role: 'league_admin' }],
    ...overrides,
  };
}

describe('RoleProvider (/me)', () => {
  it('publishes memberships, active-team features and league roles from /me, and caches them', async () => {
    const me = mePayload();
    mockFetchMe.mockResolvedValue(me);

    const { result } = renderHook(() => ({
      role: useRole(),
      canMessage: useCan(Feature.DIRECT_MESSAGES),
      canAdminLeague: useCan('league.admin'),
    }), { wrapper });
    await waitFor(() => expect(result.current.role.loading).toBe(false));

    expect(result.current.role.memberships.map((m) => [m.teamId, m.isTournamentTeam, m.tier])).toEqual([
      ['regular', false, SubscriptionTier.STARTER],
      ['cup-team', true, SubscriptionTier.FREE],
    ]);
    expect(result.current.role.features).toEqual([Feature.DIRECT_MESSAGES]);
    expect(result.current.role.isLeagueAdmin).toBe(true);
    expect(result.current.canMessage).toBe(true);
    expect(result.current.canAdminLeague).toBe(true);
    expect(mockWriteCachedMe).toHaveBeenCalledWith(me);

    // Features follow the active team.
    await act(async () => { await result.current.role.setActiveTeamId('cup-team'); });
    expect(result.current.role.features).toEqual([]);
    expect(result.current.canMessage).toBe(false);
  });

  it('starts offline from the cached /me without falling back to a direct read', async () => {
    mockReadCachedMe.mockResolvedValue(mePayload());
    mockFetchMe.mockRejectedValue(new ApiError('offline', 'Network request failed'));

    const { result } = renderHook(() => useRole(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.memberships.map((m) => m.teamId)).toEqual(['regular', 'cup-team']);
    expect(result.current.leagueRoles).toHaveLength(1);
    expect(mockReadCachedMe).toHaveBeenCalledWith('coach');
  });

  it('keeps the selected team when the fresh /me replaces the cached one', async () => {
    mockReadCachedMe.mockResolvedValue(mePayload());
    let resolveFetch: (me: MeResponse) => void = () => {};
    mockFetchMe.mockReturnValue(new Promise((resolve) => { resolveFetch = resolve; }));

    const { result } = renderHook(() => useRole(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.setActiveTeamId('cup-team'); });

    await act(async () => resolveFetch(mePayload()));
    expect(result.current.activeTeam?.teamId).toBe('cup-team');
  });
});
