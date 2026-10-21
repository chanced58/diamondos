import { NextResponse } from 'next/server';
import { GET as getHistory } from '../history/route';
import { POST as postVoid } from '../corrections/void/route';
import { POST as postInsert } from '../corrections/insert/route';
import { POST as postReplace } from '../corrections/replace/route';
import { POST as postReplay } from '../corrections/replay-at-bat/route';

const mockRequireApiUser = jest.fn();
const mockLoadGameHistory = jest.fn();
const mockVoid = jest.fn();
const mockInsert = jest.fn();
const mockReplace = jest.fn();
const mockReplay = jest.fn();

jest.mock('@/lib/api/bearer-auth', () => ({
  ...jest.requireActual('@/lib/api/bearer-auth'),
  requireApiUser: (req: Request) => mockRequireApiUser(req),
}));
jest.mock('@/lib/services/game-corrections/load-game-history', () => ({
  loadGameHistory: (...args: unknown[]) => mockLoadGameHistory(...args),
}));
jest.mock('@/lib/services/game-corrections/corrections', () => ({
  voidGameEvent: (...args: unknown[]) => mockVoid(...args),
  insertCorrectionEvents: (...args: unknown[]) => mockInsert(...args),
  replaceGameEvent: (...args: unknown[]) => mockReplace(...args),
  replayAtBat: (...args: unknown[]) => mockReplay(...args),
}));

const DB = { name: 'db' };
const gameParams = { params: { gameId: 'game-1' } };
const request = (method: string, body?: unknown) =>
  new Request('https://example.com/api/m/v1/x', {
    method,
    headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const ok = { ok: true, data: { gameId: 'game-1' } };

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireApiUser.mockResolvedValue({ user: { id: 'u1' }, db: DB });
});

describe('history and correction routes', () => {
  it('should respond 401 without calling a service', async () => {
    mockRequireApiUser.mockResolvedValue({ response: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) });
    const responses = await Promise.all([
      getHistory(request('GET'), gameParams),
      postVoid(request('POST', {}), gameParams),
      postInsert(request('POST', {}), gameParams),
      postReplace(request('POST', {}), gameParams),
      postReplay(request('POST', {}), gameParams),
    ]);
    expect(responses.map((r) => r.status)).toEqual([401, 401, 401, 401, 401]);
    for (const mock of [mockLoadGameHistory, mockVoid, mockInsert, mockReplace, mockReplay]) {
      expect(mock).not.toHaveBeenCalled();
    }
  });

  it('should load history for the path game and map not-started to 409', async () => {
    mockLoadGameHistory.mockResolvedValue({ ok: false, code: 'conflict', error: 'Game history is available once the game has started.' });
    expect((await getHistory(request('GET'), gameParams)).status).toBe(409);
    expect(mockLoadGameHistory).toHaveBeenCalledWith(DB, 'u1', { gameId: 'game-1' });
  });

  it('should record the phone as the device and take the game from the path', async () => {
    for (const mock of [mockVoid, mockInsert, mockReplace, mockReplay]) mock.mockResolvedValue(ok);

    await postVoid(request('POST', { eventId: 'e1', deviceId: 'phone-1' }), gameParams);
    await postInsert(request('POST', { events: [], gameId: 'other' }), gameParams);
    await postReplace(request('POST', { eventId: 'e1', eventType: 'hit', payload: { a: 1 }, deviceId: 'x'.repeat(500) }), gameParams);
    await postReplay(request('POST', { gameId: 'other', voidEventIds: ['e1'] }), gameParams);

    expect(mockVoid).toHaveBeenCalledWith(DB, 'u1', { gameId: 'game-1', eventId: 'e1' }, 'phone-1');
    expect(mockInsert).toHaveBeenCalledWith(DB, 'u1', { gameId: 'game-1', events: [] }, 'mobile');
    // An oversized device id falls back rather than reaching the log.
    expect(mockReplace).toHaveBeenCalledWith(DB, 'u1', { gameId: 'game-1', eventId: 'e1', eventType: 'hit', payload: { a: 1 } }, 'mobile');
    expect(mockReplay).toHaveBeenCalledWith(DB, 'u1', { gameId: 'game-1', voidEventIds: ['e1'] }, 'mobile');
  });

  it('should map a non-coach correction to 403', async () => {
    mockVoid.mockResolvedValue({ ok: false, code: 'forbidden', error: 'Only coaches can perform this action.' });
    expect((await postVoid(request('POST', { eventId: 'e1' }), gameParams)).status).toBe(403);
  });
});
