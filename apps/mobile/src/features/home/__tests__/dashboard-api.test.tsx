import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import { useDashboard } from '../dashboard-api';

const mockGet = jest.fn();
jest.mock('../../../lib/api-client', () => ({ apiClient: { get: (...args: unknown[]) => mockGet(...args) } }));

const dashboard = (teamId: string, view: string) => ({ teamId, view, liveGames: [] });

// One client for the whole render, so the cache survives rerenders.
const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useDashboard', () => {
  it("should keep the team's other view on screen while switching, but never another team's", async () => {
    let resolveLeague: (value: unknown) => void = () => {};
    mockGet.mockImplementation((path: string) => {
      if (path.endsWith('?view=league')) return new Promise((resolve) => { resolveLeague = resolve; });
      return Promise.resolve(dashboard(path.split('/')[2], 'team'));
    });

    const { result, rerender } = renderHook(({ teamId, view }) => useDashboard(teamId, view), {
      wrapper,
      initialProps: { teamId: 't1', view: 'team' as 'team' | 'league' },
    });
    await waitFor(() => expect(result.current.data).toEqual(dashboard('t1', 'team')));

    rerender({ teamId: 't1', view: 'league' });
    // Still the team view, so the switch stays usable while the league view loads.
    expect(result.current.data).toEqual(dashboard('t1', 'team'));
    resolveLeague(dashboard('t1', 'league'));
    await waitFor(() => expect(result.current.data).toEqual(dashboard('t1', 'league')));

    rerender({ teamId: 't2', view: 'team' });
    expect(result.current.data).toBeUndefined();
    await waitFor(() => expect(result.current.data).toEqual(dashboard('t2', 'team')));
  });
});
