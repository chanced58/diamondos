import { NextResponse } from 'next/server';
import { GET as getBoxScore } from '../box-score/route';

const mockRequireApiUser = jest.fn();
const mockLoadGameBoxScore = jest.fn();

jest.mock('@/lib/api/bearer-auth', () => ({
  ...jest.requireActual('@/lib/api/bearer-auth'),
  requireApiUser: (req: Request) => mockRequireApiUser(req),
}));
jest.mock('@/lib/services/games/load-game-box-score', () => ({
  loadGameBoxScore: (...args: unknown[]) => mockLoadGameBoxScore(...args),
}));

const DB = { name: 'db' };
const gameParams = { params: { gameId: 'game-1' } };
const request = (method = 'GET') =>
  new Request('https://example.com/api/m/v1/x', { method, headers: { authorization: 'Bearer token' } });

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
