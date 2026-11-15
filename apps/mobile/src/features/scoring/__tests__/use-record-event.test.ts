import { renderHook } from '@testing-library/react-native';
import { useRecordEvent } from '../use-record-event';

const mockReport = jest.fn();
const mockWrite = jest.fn();
const mockTriggerSync = jest.fn(async () => {});

jest.mock('expo-crypto', () => ({ randomUUID: () => 'event-1' }));
jest.mock('../../../db', () => ({ database: {
  get: () => ({ create: jest.fn() }),
  write: (work: () => Promise<void>) => mockWrite(work),
} }));
jest.mock('../../../lib/device-id', () => ({ getDeviceId: async () => 'device-1' }));
jest.mock('../../../lib/supabase', () => ({ getSupabaseClient: () => ({
  auth: { getSession: async () => ({ data: { session: { user: { id: 'coach' } } } }) },
}) }));
jest.mock('../../../providers/SyncProvider', () => ({ useSyncContext: () => ({ triggerSync: mockTriggerSync }) }));
jest.mock('../../../lib/error-report', () => ({
  reportClientError: (...args: unknown[]) => mockReport(...args),
}));
jest.mock('../sequence-number', () => ({ readNextSequenceNumber: async () => 1 }));

const GAME_ID = '11111111-1111-4111-8111-111111111111';

beforeEach(() => jest.clearAllMocks());

describe('useRecordEvent', () => {
  it('recordEvent rethrows the original error after reporting', async () => {
    const original = new Error('database is locked');
    mockWrite.mockRejectedValue(original);
    const { result } = renderHook(() => useRecordEvent(GAME_ID));

    await expect(result.current.recordEvent('pitch_thrown' as never, 1, true, {} as never)).rejects.toBe(original);

    expect(mockReport).toHaveBeenCalledWith('scoring.record', original, {
      gameId: GAME_ID,
      details: { eventType: 'pitch_thrown' },
    });
  });

  it('should report nothing when the event is recorded', async () => {
    mockWrite.mockImplementation(async (work: () => Promise<void>) => work());
    const { result } = renderHook(() => useRecordEvent(GAME_ID));

    await expect(result.current.recordEvent('pitch_thrown' as never, 1, true, {} as never)).resolves.toBe('event-1');

    expect(mockReport).not.toHaveBeenCalled();
  });
});
