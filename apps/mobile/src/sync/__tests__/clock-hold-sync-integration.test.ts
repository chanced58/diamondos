import { getClockHeldEvents, reconcileGameLifecycle, syncWithSupabase } from '../sync-engine';

const SERVER_NOW = Date.parse('2026-11-11T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

const mockStorage = new Map<string, string>();
const mockChanges: Record<string, unknown> = {};
const mockUpsert = jest.fn();
let mockPushResult: unknown;
jest.mock('../../db', () => ({ database: {
  get: () => ({ query: () => ({ fetch: async () => [] }) }),
  localStorage: {
    get: async (key: string) => mockStorage.get(key),
    set: async (key: string, value: string) => { mockStorage.set(key, value); },
  },
} }));
jest.mock('../lineup-sync', () => ({
  getDirtyLineupState: async () => ({ dirtyGameIds: new Set(), localEditedAtMsByGame: new Map() }),
  pushLineupsForGame: jest.fn(),
  applyServerLineupSnapshot: jest.fn(),
  gamesWaitingOnGuests: async () => new Set(),
}));
jest.mock('@nozbe/watermelondb/sync', () => ({
  synchronize: async (options: { pushChanges: (args: unknown) => Promise<unknown> }) => {
    mockPushResult = await options.pushChanges({ changes: mockChanges });
  },
}));
jest.mock('../../lib/supabase', () => ({ getSupabaseClient: () => ({
  from: () => ({ upsert: (...args: unknown[]) => mockUpsert(...args) }),
  rpc: jest.fn(async () => ({ data: [], error: null })),
  auth: { getUser: async () => ({ data: { user: { id: 'coach' } } }) },
}) }));

function row(id: string, game: string, sequence: number, occurredAt: number) {
  return { id: `wdb-${id}`, remote_id: id, game_remote_id: game, sequence_number: sequence, event_type: 'pitch_thrown',
    inning: 1, is_top_of_inning: true, payload: '{}', occurred_at: occurredAt, created_by: 'coach', device_id: 'device' };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockStorage.clear();
  mockPushResult = undefined;
  for (const key of Object.keys(mockChanges)) delete mockChanges[key];
  // The server: refuse any batch holding an event more than a day ahead, as the trigger does.
  mockUpsert.mockImplementation(async (rows: Array<{ occurred_at: string }>) => (
    rows.some((event) => Date.parse(event.occurred_at) > SERVER_NOW + DAY)
      ? { error: { code: 'P0001', hint: 'device_clock_ahead', details: String(SERVER_NOW), message: 'game_events.occurred_at (...) is more than 24h ahead' } }
      : { error: null }
  ));
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => { jest.restoreAllMocks(); });

it('should push the healthy events, hold the future-dated one on the device and record it for the scorer', async () => {
  mockChanges.game_events = { created: [
    row('pitch-1', 'g1', 1, SERVER_NOW), row('fast', 'g1', 2, SERVER_NOW + 3 * DAY), row('other-game', 'g2', 1, SERVER_NOW),
  ] };

  await syncWithSupabase();

  const pushed = mockUpsert.mock.calls.map(([rows]) => (rows as Array<{ id: string }>).map((event) => event.id));
  expect(pushed[pushed.length - 1]).toEqual(['pitch-1', 'other-game']);
  expect(mockPushResult).toEqual({ experimentalRejectedIds: { game_events: ['wdb-fast'] } });
  expect(await getClockHeldEvents()).toEqual([{ gameId: 'g1', eventId: 'fast' }]);
});

it('should clear the register once nothing is held', async () => {
  mockStorage.set('sync.clockHeldEvents', JSON.stringify([{ gameId: 'g1', eventId: 'fast' }]));
  mockChanges.game_events = { created: [row('fast', 'g1', 2, SERVER_NOW)] };

  await syncWithSupabase();

  expect(mockPushResult).toBeUndefined();
  expect(await getClockHeldEvents()).toEqual([]);
});

it('should not finalize a game while its events are held', async () => {
  mockStorage.set('sync.clockHeldEvents', JSON.stringify([{ gameId: 'g1', eventId: 'fast' }]));
  const fetchMock = jest.fn();
  const supabase = { from: jest.fn() };
  jest.spyOn(jest.requireMock('../../db').database, 'get').mockReturnValue({ query: () => ({ fetch: async () => [
    { eventType: 'game_end', remoteId: 'g1-end', gameRemoteId: 'g1', payload: {} },
  ] }) });
  const games = { select: () => games, in: async () => ({ data: [{ id: 'g1', status: 'in_progress', result_source: null }], error: null }) };
  supabase.from.mockReturnValue(games);
  const originalFetch = global.fetch;
  global.fetch = fetchMock as unknown as typeof fetch;
  try {
    await reconcileGameLifecycle(supabase as never, 'https://app.test');
  } finally {
    global.fetch = originalFetch;
  }
  expect(fetchMock).not.toHaveBeenCalled();
  expect(supabase.from).toHaveBeenCalledTimes(1);
});

it('should treat an unreadable register as empty', async () => {
  mockStorage.set('sync.clockHeldEvents', '[{"gameId":1}]');
  expect(await getClockHeldEvents()).toEqual([]);
});
