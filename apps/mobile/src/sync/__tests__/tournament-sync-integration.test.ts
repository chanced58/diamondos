import { getTournamentSyncRejections, syncWithSupabase } from '../sync-engine';

const mockOrder: string[] = [];
const mockSent: string[] = [];
const mockStorage = new Map<string, string>();
const mockChanges: Record<string, unknown> = {};
const mockRpc = jest.fn();
const mockUpsert = jest.fn();
const mockLineupPush = jest.fn();
const mockDb = {
  localStorage: { get: async (key: string) => mockStorage.get(key), set: async (key: string, value: string) => { mockStorage.set(key, value); } },
  get: (table: string) => ({ query: () => ({ fetch: async () => table === 'games' ? [{ tournamentId: 'cup' }] : [] }) }),
};
jest.mock('../../db', () => ({ database: {
  get: (table: string) => mockDb.get(table),
  localStorage: { get: (key: string) => mockDb.localStorage.get(key), set: (key: string, value: string) => mockDb.localStorage.set(key, value) },
} }));
jest.mock('../lineup-sync', () => ({
  getDirtyLineupState: async () => ({ dirtyGameIds: new Set(['one']), localEditedAtMsByGame: new Map() }),
  pushLineupsForGame: (...args: unknown[]) => mockLineupPush(...args),
  applyServerLineupSnapshot: jest.fn(),
}));
jest.mock('@nozbe/watermelondb/sync', () => ({ synchronize: async (options: { pushChanges: (args: unknown) => Promise<void> }) => options.pushChanges({ changes: mockChanges }) }));
jest.mock('../../lib/supabase', () => ({ getSupabaseClient: () => ({
  rpc: (...args: unknown[]) => mockRpc(...args),
  from: () => ({ upsert: (...args: unknown[]) => mockUpsert(...args) }),
}) }));

function row(id: string, game = 'one', type = 'substitution', sequence = 2) {
  return { id: `local-${id}`, remote_id: id, game_remote_id: game, sequence_number: sequence, event_type: type,
    inning: 1, is_top_of_inning: false, payload: JSON.stringify(type === 'substitution' ? { substitutionType: 'lineup_extension', inPlayerId: 'late', battingOrderPosition: 10 } : {}),
    occurred_at: Date.parse('2026-10-20T12:00:00Z'), created_by: 'coach', device_id: 'device' };
}

beforeEach(() => {
  jest.clearAllMocks(); mockOrder.length = 0; mockSent.length = 0; mockStorage.clear();
  for (const key of Object.keys(mockChanges)) delete mockChanges[key];
  mockLineupPush.mockImplementation(async (_client, _db, id) => { mockOrder.push(`lineup:${id}`); return 'pushed'; });
  mockRpc.mockImplementation(async (name) => { mockOrder.push(name); return { data: [], error: null }; });
  mockUpsert.mockImplementation(async (rows: Array<{ id: string }>) => { mockSent.push(...rows.map((event) => event.id)); return { error: null }; });
});

it('prepares dirty starting rows before starting and extending an offline tournament game', async () => {
  mockChanges.game_events = { created: [row('start', 'one', 'game_start', 1), row('change')] };
  await syncWithSupabase();
  expect(mockOrder).toEqual(['lineup:one', 'start_tournament_game_for_user']);
  expect(mockSent).toEqual(['change']);
});

it('persists the rejected event identity while uploading another game and retaining the failed cycle for retry', async () => {
  mockChanges.game_events = { created: [row('bad'), row('held', 'one', 'out', 3), row('healthy', 'two', 'out', 1)] };
  mockUpsert.mockImplementation(async (rows: Array<{ id: string }>) => {
    if (rows[0].id === 'bad') return { error: { code: '23514', message: 'Tournament cap reached' } };
    mockSent.push(rows[0].id); return { error: null };
  });
  await expect(syncWithSupabase()).rejects.toThrow('Tournament cap reached');
  expect(mockSent).toEqual(['healthy']);
  expect(await getTournamentSyncRejections()).toEqual([expect.objectContaining({ gameId: 'one', eventId: 'bad', reason: 'Tournament cap reached' })]);
});

it('uses the atomic cancellation RPC and clears the rejection after the corrected retry', async () => {
  const change = row('bad');
  const cancelled = row('cancel', 'one', 'event_voided', 3);
  cancelled.payload = JSON.stringify({ voidedEventId: 'bad', voidedSequenceNumber: 2, cancelledBeforeSync: true });
  mockChanges.game_events = { created: [change, cancelled, row('later', 'one', 'out', 4)] };
  mockStorage.set('sync.tournamentRejections', JSON.stringify([{ gameId: 'one', eventId: 'bad' }]));
  await syncWithSupabase();
  expect(mockRpc).toHaveBeenCalledWith('sync_cancelled_tournament_lineup_change', expect.objectContaining({ p_change: expect.objectContaining({ id: 'bad' }), p_void: expect.objectContaining({ id: 'cancel' }) }));
  expect(mockSent).toEqual(['later']);
  expect(await getTournamentSyncRejections()).toEqual([]);
  expect(JSON.parse(change.payload).substitutionType).toBe('lineup_extension');
});
