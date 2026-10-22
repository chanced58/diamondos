import { NextResponse } from 'next/server';
import { GET as getBoxScore } from '../box-score/route';
import { GET as getNotes, PUT as putNotes } from '../notes/route';
import { PUT as putPlayerNotes } from '../notes/players/[playerId]/route';
import { GET as getOpponentLineup, PUT as putOpponentLineup } from '../opponent-lineup/route';
import { POST as postAutoFill } from '../opponent-lineup/auto-fill/route';
import { PUT as putOpponentTeam } from '../opponent-team/route';
import { POST as postOpponentPlayer } from '../opponent-players/route';
import { DELETE as deleteOpponentPlayer, PATCH as patchOpponentPlayer } from '../opponent-players/[playerId]/route';

const mockRequireApiUser = jest.fn();
const mockLoadGameBoxScore = jest.fn();
const mockLoadGameNotes = jest.fn();
const mockSaveGameNotes = jest.fn();
const mockSavePlayerGameNotes = jest.fn();
const mockLoadOpponentLineup = jest.fn();
const mockSaveOpponentLineup = jest.fn();
const mockAutoFill = jest.fn();
const mockSaveOpponentTeam = jest.fn();
const mockAddOpponentPlayer = jest.fn();
const mockUpdateOpponentPlayer = jest.fn();
const mockRemoveOpponentPlayer = jest.fn();

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
jest.mock('@/lib/services/opponent-lineup/load-opponent-lineup', () => ({
  loadOpponentLineup: (...args: unknown[]) => mockLoadOpponentLineup(...args),
}));
jest.mock('@/lib/services/opponent-lineup/opponent-batting-order', () => ({
  saveOpponentLineup: (...args: unknown[]) => mockSaveOpponentLineup(...args),
  autoFillOpponentLineup: (...args: unknown[]) => mockAutoFill(...args),
}));
jest.mock('@/lib/services/opponent-lineup/opponent-team', () => ({
  saveOpponentTeam: (...args: unknown[]) => mockSaveOpponentTeam(...args),
}));
jest.mock('@/lib/services/opponent-lineup/opponent-roster', () => ({
  addOpponentPlayer: (...args: unknown[]) => mockAddOpponentPlayer(...args),
  updateOpponentPlayer: (...args: unknown[]) => mockUpdateOpponentPlayer(...args),
  removeOpponentPlayer: (...args: unknown[]) => mockRemoveOpponentPlayer(...args),
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

describe('opponent lineup routes', () => {
  const playerParams = { params: { gameId: 'game-1', playerId: 'p1' } };
  const ok = { ok: true, data: {} };

  it('should respond 401 to every opponent route without calling a service', async () => {
    mockRequireApiUser.mockResolvedValue({ response: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) });
    const responses = await Promise.all([
      getOpponentLineup(request(), gameParams),
      putOpponentLineup(request('PUT', {}), gameParams),
      postAutoFill(request('POST'), gameParams),
      putOpponentTeam(request('PUT', {}), gameParams),
      postOpponentPlayer(request('POST', {}), gameParams),
      patchOpponentPlayer(request('PATCH', {}), playerParams),
      deleteOpponentPlayer(request('DELETE'), playerParams),
    ]);
    expect(responses.map((r) => r.status)).toEqual([401, 401, 401, 401, 401, 401, 401]);
    for (const mock of [mockLoadOpponentLineup, mockSaveOpponentLineup, mockAutoFill, mockSaveOpponentTeam,
      mockAddOpponentPlayer, mockUpdateOpponentPlayer, mockRemoveOpponentPlayer]) {
      expect(mock).not.toHaveBeenCalled();
    }
  });

  it('should pass path ids over any in the body', async () => {
    for (const mock of [mockSaveOpponentLineup, mockSaveOpponentTeam, mockAddOpponentPlayer, mockUpdateOpponentPlayer]) {
      mock.mockResolvedValue(ok);
    }
    await putOpponentLineup(request('PUT', { gameId: 'other', entries: [] }), gameParams);
    await putOpponentTeam(request('PUT', { gameId: 'other', name: 'Eagles' }), gameParams);
    await patchOpponentPlayer(request('PATCH', { gameId: 'other', playerId: 'other', firstName: 'Ty' }), playerParams);

    expect(mockSaveOpponentLineup).toHaveBeenCalledWith(DB, 'u1', { gameId: 'game-1', entries: [] });
    expect(mockSaveOpponentTeam).toHaveBeenCalledWith(DB, 'u1', { gameId: 'game-1', name: 'Eagles' });
    expect(mockUpdateOpponentPlayer).toHaveBeenCalledWith(DB, 'u1', { gameId: 'game-1', playerId: 'p1', firstName: 'Ty' });
  });

  it('should answer 201 for an added player and 404 for a player off the roster', async () => {
    mockAddOpponentPlayer.mockResolvedValue({ ok: true, data: { playerId: 'p1' } });
    expect((await postOpponentPlayer(request('POST', { firstName: 'Ty', lastName: 'Cobb' }), gameParams)).status).toBe(201);
    mockRemoveOpponentPlayer.mockResolvedValue({ ok: false, code: 'not_found', error: 'Player not found on this opponent team.' });
    expect((await deleteOpponentPlayer(request('DELETE'), playerParams)).status).toBe(404);
    expect(mockRemoveOpponentPlayer).toHaveBeenCalledWith(DB, 'u1', { gameId: 'game-1', playerId: 'p1' });
  });
});
