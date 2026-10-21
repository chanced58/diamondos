import { NextResponse } from 'next/server';
import { GET as getBoxScore } from '../box-score/route';
import { GET as getNotes, PUT as putNotes } from '../notes/route';
import { PUT as putPlayerNotes } from '../notes/players/[playerId]/route';

const mockRequireApiUser = jest.fn();
const mockLoadGameBoxScore = jest.fn();
const mockLoadGameNotes = jest.fn();
const mockSaveGameNotes = jest.fn();
const mockSavePlayerGameNotes = jest.fn();

jest.mock('@/lib/api/bearer-auth', () => ({
  ...jest.requireActual('@/lib/api/bearer-auth'),
  requireApiUser: (req: Request) => mockRequireApiUser(req),
}));
jest.mock('@/lib/services/games/load-game-box-score', () => ({
  loadGameBoxScore: (...args: unknown[]) => mockLoadGameBoxScore(...args),
}));
jest.mock('@/lib/services/games/load-game-notes', () => ({
  loadGameNotes: (...args: unknown[]) => mockLoadGameNotes(...args),
}));
jest.mock('@/lib/services/games/save-game-notes', () => ({
  saveGameNotes: (...args: unknown[]) => mockSaveGameNotes(...args),
  savePlayerGameNotes: (...args: unknown[]) => mockSavePlayerGameNotes(...args),
}));

const DB = { name: 'db' };
const gameParams = { params: { gameId: 'game-1' } };
const request = (method = 'GET', body?: unknown) =>
  new Request('https://example.com/api/m/v1/x', {
    method,
    headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireApiUser.mockResolvedValue({ user: { id: 'u1' }, db: DB });
});

describe('box score route', () => {
  it('should respond 401 without calling the service when unauthenticated', async () => {
    mockRequireApiUser.mockResolvedValue({ response: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) });
    expect((await getBoxScore(request(), gameParams)).status).toBe(401);
    expect(mockLoadGameBoxScore).not.toHaveBeenCalled();
  });

  it('should return the box score for the bearer user and the path game', async () => {
    mockLoadGameBoxScore.mockResolvedValue({ ok: true, data: { gameId: 'game-1' } });
    const res = await getBoxScore(request(), gameParams);
    expect(res.status).toBe(200);
    expect(mockLoadGameBoxScore).toHaveBeenCalledWith(DB, 'u1', { gameId: 'game-1' });
  });

  it('should map a game that has not started to 409', async () => {
    mockLoadGameBoxScore.mockResolvedValue({ ok: false, code: 'conflict', error: 'Stats are available once the game has started.' });
    const res = await getBoxScore(request(), gameParams);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'Stats are available once the game has started.', code: 'conflict' });
  });
});

describe('game notes routes', () => {
  it('should respond 401 to every notes route without calling a service', async () => {
    mockRequireApiUser.mockResolvedValue({ response: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) });
    expect((await getNotes(request(), gameParams)).status).toBe(401);
    expect((await putNotes(request('PUT', {}), gameParams)).status).toBe(401);
    expect((await putPlayerNotes(request('PUT', {}), { params: { gameId: 'game-1', playerId: 'p1' } })).status).toBe(401);
    expect(mockLoadGameNotes).not.toHaveBeenCalled();
    expect(mockSaveGameNotes).not.toHaveBeenCalled();
    expect(mockSavePlayerGameNotes).not.toHaveBeenCalled();
  });

  it('should load the notes for the bearer user and the path game', async () => {
    mockLoadGameNotes.mockResolvedValue({ ok: true, data: { gameId: 'game-1', view: 'member' } });
    const res = await getNotes(request(), gameParams);
    expect(res.status).toBe(200);
    expect(mockLoadGameNotes).toHaveBeenCalledWith(DB, 'u1', { gameId: 'game-1' });
  });

  it('should save coach notes with the path game overriding any body gameId', async () => {
    mockSaveGameNotes.mockResolvedValue({ ok: true, data: { gameId: 'game-1' } });
    const res = await putNotes(request('PUT', { gameId: 'other', overallNotes: 'Windy' }), gameParams);
    expect(res.status).toBe(200);
    expect(mockSaveGameNotes).toHaveBeenCalledWith(DB, 'u1', { gameId: 'game-1', overallNotes: 'Windy' });
  });

  it('should map a non-coach save to 403', async () => {
    mockSaveGameNotes.mockResolvedValue({ ok: false, code: 'forbidden', error: 'Only coaches can perform this action.' });
    expect((await putNotes(request('PUT', {}), gameParams)).status).toBe(403);
  });

  it("should save a player's own notes from the path ids", async () => {
    mockSavePlayerGameNotes.mockResolvedValue({ ok: true, data: { gameId: 'game-1', playerId: 'p1' } });
    const res = await putPlayerNotes(
      request('PUT', { playerNotes: 'Felt good', playerId: 'other' }),
      { params: { gameId: 'game-1', playerId: 'p1' } },
    );
    expect(res.status).toBe(200);
    expect(mockSavePlayerGameNotes).toHaveBeenCalledWith(DB, 'u1', { gameId: 'game-1', playerId: 'p1', playerNotes: 'Felt good' });
  });
});
