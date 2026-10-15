import { act, renderHook, waitFor } from '@testing-library/react-native';
import { defaultLeagueScoringSettings, TOURNAMENT_SCORING_RULES_VERSION } from '@baseball/shared';
import { useGameScoringSettings } from '../game-scoring-settings';

const mockRows = new Map<string, Record<string, unknown>>();
const mockFetchConnection = jest.fn();
const mockRemote = jest.fn();
const mockCreate = jest.fn();
const mockObservers = new Map<string, (rows: Record<string, unknown>[]) => void>();
const mockCollection = {
  query: (clause: { comparison: { right: { value: string } } }) => ({
    fetch: async () => { const row = mockRows.get(clause.comparison.right.value); return row ? [row] : []; },
    observeWithColumns: () => ({ subscribe: (observer: { next: (rows: Record<string, unknown>[]) => void }) => {
      const id = clause.comparison.right.value;
      mockObservers.set(id, observer.next);
      return { unsubscribe: () => mockObservers.delete(id) };
    } }),
  }),
  create: mockCreate,
};
jest.mock('@react-native-community/netinfo', () => ({ __esModule: true, default: { fetch: () => mockFetchConnection() } }));
jest.mock('../../db', () => ({ database: { get: () => mockCollection, write: async (callback: () => Promise<void>) => callback() } }));
jest.mock('../supabase', () => ({ getSupabaseClient: () => ({
  from: (table: string) => {
    let id: unknown;
    const query = { select: () => query, eq: (_column: string, value: unknown) => { id = value; return query; }, maybeSingle: () => mockRemote(table, id) };
    return query;
  },
}) }));

function rules(cap: number) {
  const settings = defaultLeagueScoringSettings();
  return { ...settings, lineup: { ...settings.lineup, allowExpanded: true, maxBatters: cap, allowMidGameContraction: true } };
}

function cache(gameId: string, cap: number) {
  const row: Record<string, unknown> = {
    teamId: 'same-team', tournamentId: `cup-${gameId}`, tournamentRulesVersion: TOURNAMENT_SCORING_RULES_VERSION,
    tournamentScoringSettings: JSON.stringify(rules(cap)),
  };
  row.update = async (callback: (record: Record<string, unknown>) => void) => callback(row);
  mockRows.set(gameId, row);
  return row;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRows.clear();
  mockObservers.clear();
  mockFetchConnection.mockResolvedValue({ isConnected: false, isInternetReachable: false });
  mockRemote.mockResolvedValue({ data: null, error: null });
});

it('adopts the frozen rules pulled after reconnect without requiring the scorer to reopen the game', async () => {
  const row = cache('one', 12);
  const { result } = renderHook(() => useGameScoringSettings('one'));
  await waitFor(() => expect(result.current.settings?.lineup.maxBatters).toBe(12));
  row.tournamentScoringSettings = JSON.stringify(rules(10));
  act(() => mockObservers.get('one')?.([row]));
  expect(result.current.settings?.lineup.maxBatters).toBe(10);
});

it('keeps two offline games on the same team on their own downloaded rules', async () => {
  cache('one', 12); cache('two', 10);
  const { result, rerender } = renderHook(({ id }) => useGameScoringSettings(id), { initialProps: { id: 'one' } });
  await waitFor(() => expect(result.current.settings?.lineup.maxBatters).toBe(12));
  rerender({ id: 'two' });
  await waitFor(() => expect(result.current.settings?.lineup.maxBatters).toBe(10));
  expect(result.current.tournamentId).toBe('cup-two');
});

it('blocks an uncached game offline instead of falling back to league defaults', async () => {
  const { result } = renderHook(() => useGameScoringSettings('missing'));
  await waitFor(() => expect(result.current.status).toBe('error'));
  expect(result.current.settings).toBeNull();
  expect(result.current.error).toContain('Connect and sync');
});

it('blocks an outdated downloaded tournament snapshot', async () => {
  cache('one', 12).tournamentRulesVersion = -1;
  const { result } = renderHook(() => useGameScoringSettings('one'));
  await waitFor(() => expect(result.current.status).toBe('error'));
  expect(result.current.settings).toBeNull();
});

it('keeps downloaded game access when tournament creation permission is revoked', async () => {
  cache('one', 12);
  const { result } = renderHook(() => useGameScoringSettings('one'));
  await waitFor(() => expect(result.current.status).toBe('ready'));
  expect(result.current.isTournament).toBe(true);
  expect(mockRemote).not.toHaveBeenCalled();
});

it('loads and persists frozen rules on reconnect and reuses them after reload offline', async () => {
  const row = cache('one', 12);
  row.tournamentScoringSettings = null;
  const { result, unmount } = renderHook(() => useGameScoringSettings('one'));
  await waitFor(() => expect(result.current.status).toBe('error'));
  mockFetchConnection.mockResolvedValue({ isConnected: true, isInternetReachable: true });
  mockRemote.mockResolvedValue({ data: { id: 'one', team_id: 'same-team', tournament_id: 'cup-one', scoring_settings_snapshot: rules(10) }, error: null });
  act(() => result.current.retry());
  await waitFor(() => expect(result.current.settings?.lineup.maxBatters).toBe(10));
  unmount();
  mockFetchConnection.mockResolvedValue({ isConnected: false, isInternetReachable: false });
  const reloaded = renderHook(() => useGameScoringSettings('one'));
  await waitFor(() => expect(reloaded.result.current.settings?.lineup.maxBatters).toBe(10));
});

it('retains a valid downloaded snapshot after a network failure', async () => {
  cache('one', 12);
  mockFetchConnection.mockResolvedValue({ isConnected: true, isInternetReachable: true });
  mockRemote.mockResolvedValue({ data: null, error: new Error('network down') });
  const { result } = renderHook(() => useGameScoringSettings('one'));
  await waitFor(() => expect(result.current.status).toBe('ready'));
  expect(result.current.settings?.lineup.maxBatters).toBe(12);
});
