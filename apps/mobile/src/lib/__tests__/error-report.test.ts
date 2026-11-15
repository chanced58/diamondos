import type { ClientErrorEntry } from '@baseball/shared';
import { ApiError } from '../api-client';
import { flushClientErrors, reportClientError } from '../error-report';

const mockStorage = new Map<string, string>();
const mockSet = jest.fn(async (key: string, value: string) => { mockStorage.set(key, value); });
const mockGet = jest.fn(async (key: string) => mockStorage.get(key));
const mockPost = jest.fn();
const mockGetDeviceId = jest.fn(async () => 'device-1');

jest.mock('../../db', () => ({ database: { localStorage: {
  get: (key: string) => mockGet(key),
  set: (key: string, value: string) => mockSet(key, value),
} } }));
jest.mock('../api-client', () => {
  const actual = jest.requireActual('../api-client');
  return { ...actual, apiClient: { post: (...args: unknown[]) => mockPost(...args) } };
});
jest.mock('../device-id', () => ({ getDeviceId: () => mockGetDeviceId() }));
jest.mock('../app-version', () => ({ APP_VERSION: '1.2.3' }));

const KEY = 'errors.pending';
const GAME_ID = '11111111-1111-4111-8111-111111111111';

function entry(message: string): ClientErrorEntry {
  return { area: 'sync.failed', message, occurredAt: '2026-11-14T12:00:00.000Z' };
}

function stored(): ClientErrorEntry[] {
  return JSON.parse(mockStorage.get(KEY) ?? '[]');
}

/** Lets the fire-and-forget register chain settle. */
async function settle() {
  for (let i = 0; i < 20; i++) await Promise.resolve();
  await new Promise((resolve) => setImmediate(resolve));
}

beforeEach(() => {
  mockStorage.clear();
  jest.clearAllMocks();
  mockGetDeviceId.mockImplementation(async () => 'device-1');
  mockSet.mockImplementation(async (key: string, value: string) => { mockStorage.set(key, value); });
  mockGet.mockImplementation(async (key: string) => mockStorage.get(key));
});

describe('reportClientError', () => {
  it('should queue a sanitized entry with the app version, device and game', async () => {
    reportClientError('scoring.record', new Error('disk full'), {
      gameId: GAME_ID,
      details: { eventType: 'pitch_thrown', accessToken: 'secret' },
    });
    await settle();

    expect(stored()).toEqual([expect.objectContaining({
      area: 'scoring.record',
      message: 'disk full',
      details: { eventType: 'pitch_thrown' },
      appVersion: '1.2.3',
      deviceId: 'device-1',
      gameId: GAME_ID,
    })]);
    expect(Number.isNaN(Date.parse(stored()[0].occurredAt))).toBe(false);
  });

  it('should keep both of two quick reports', async () => {
    reportClientError('sync.failed', new Error('one'));
    reportClientError('sync.failed', new Error('two'));
    await settle();

    expect(stored().map((e) => e.message)).toEqual(['one', 'two']);
  });

  it('should leave out a game id that is not a uuid and fill an empty message', async () => {
    reportClientError('finalize.failed', new Error(''), { gameId: 'not-a-uuid' });
    await settle();

    expect(stored()).toHaveLength(1);
    expect(stored()[0].gameId).toBeUndefined();
    expect(stored()[0].message.length).toBeGreaterThan(0);
  });

  it('reportClientError never throws when storage rejects', async () => {
    mockSet.mockImplementation(async () => { throw new Error('storage down'); });
    mockGetDeviceId.mockImplementation(async () => { throw new Error('keychain locked'); });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    expect(() => reportClientError('sync.failed', new Error('boom'))).not.toThrow();
    await settle();

    warn.mockRestore();
  });

  it('should return before touching storage', () => {
    reportClientError('sync.failed', new Error('boom'));
    expect(mockSet).not.toHaveBeenCalled();
  });
});

describe('flushClientErrors', () => {
  it('flush clears the queue on success', async () => {
    mockStorage.set(KEY, JSON.stringify([entry('a'), entry('b')]));
    mockPost.mockResolvedValue({ accepted: 2 });

    await flushClientErrors();

    expect(mockPost).toHaveBeenCalledWith('/client-errors', { entries: [entry('a'), entry('b')] });
    expect(mockSet).toHaveBeenCalledWith(KEY, '[]');
  });

  it('should keep an error reported while the post was in flight', async () => {
    mockStorage.set(KEY, JSON.stringify([entry('a')]));
    let release!: () => void;
    mockPost.mockImplementation(() => new Promise<void>((resolve) => { release = resolve; }));

    const flushing = flushClientErrors();
    await settle();
    reportClientError('sync.failed', new Error('late'));
    await settle();
    release();
    await flushing;
    await settle();

    expect(stored().map((e) => e.message)).toEqual(['late']);
  });

  it('flush keeps the queue and reports nothing when the post fails', async () => {
    const queue = JSON.stringify([entry('a'), entry('b')]);
    mockStorage.set(KEY, queue);
    mockPost.mockRejectedValue(new ApiError('offline', 'POST /client-errors failed'));

    await expect(flushClientErrors()).resolves.toBeUndefined();
    await settle();

    expect(mockSet).not.toHaveBeenCalled();
    expect(mockStorage.get(KEY)).toBe(queue);
  });

  it('flush posts nothing for an empty or corrupt register', async () => {
    await flushClientErrors();
    mockStorage.set(KEY, '[]');
    await flushClientErrors();
    mockStorage.set(KEY, '{not json');
    await flushClientErrors();

    expect(mockPost).not.toHaveBeenCalled();
  });

  it('should run one flush at a time', async () => {
    mockStorage.set(KEY, JSON.stringify([entry('a')]));
    let release!: () => void;
    mockPost.mockImplementation(() => new Promise<void>((resolve) => { release = resolve; }));

    const first = flushClientErrors();
    const second = flushClientErrors();
    await settle();
    release();
    await Promise.all([first, second]);

    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  it('should not throw when the register read fails', async () => {
    mockGet.mockImplementation(async () => { throw new Error('db closed'); });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(flushClientErrors()).resolves.toBeUndefined();
    expect(mockPost).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
