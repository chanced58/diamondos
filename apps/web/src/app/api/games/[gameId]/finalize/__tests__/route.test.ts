import { NextRequest, NextResponse } from 'next/server';
import { POST } from '../route';

const GAME_ID = '11111111-1111-4111-8111-111111111111';

const mockRequireApiUser = jest.fn();
const mockGetAuthorizedFinalizer = jest.fn();
const mockFinalizeGame = jest.fn();

jest.mock('@/lib/api/bearer-auth', () => ({
  requireApiUser: (req: Request) => mockRequireApiUser(req),
}));
jest.mock('@/lib/games/finalize', () => ({
  getAuthorizedFinalizer: (...args: unknown[]) => mockGetAuthorizedFinalizer(...args),
  finalizeGame: (...args: unknown[]) => mockFinalizeGame(...args),
}));

function finalizeRequest(body?: unknown): NextRequest {
  return new NextRequest(`https://example.com/api/games/${GAME_ID}/finalize`, {
    method: 'POST',
    headers: { authorization: 'Bearer token' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireApiUser.mockResolvedValue({ user: { id: 'coach-1' }, db: { name: 'db' } });
  mockGetAuthorizedFinalizer.mockResolvedValue({ game: { team_id: 'team-1' } });
  mockFinalizeGame.mockResolvedValue({ ok: true });
});

it('should pass through the 401 from bearer auth without finalizing', async () => {
  mockRequireApiUser.mockResolvedValue({
    response: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }),
  });

  const res = await POST(finalizeRequest(), { params: { gameId: GAME_ID } });

  expect(res.status).toBe(401);
  expect(mockFinalizeGame).not.toHaveBeenCalled();
});

it('should reject a malformed game id before authenticating', async () => {
  const res = await POST(finalizeRequest(), { params: { gameId: 'nope' } });

  expect(res.status).toBe(400);
  expect(mockRequireApiUser).not.toHaveBeenCalled();
});

it('should respond 403 when the caller is not a coach or scorekeeper on the game team', async () => {
  mockGetAuthorizedFinalizer.mockResolvedValue({ error: 'Only coaches and scorekeepers can finalize a game.', code: 'forbidden' });

  const res = await POST(finalizeRequest(), { params: { gameId: GAME_ID } });

  expect(res.status).toBe(403);
  expect(mockFinalizeGame).not.toHaveBeenCalled();
});

it('should finalize with the authenticated user and the body scores', async () => {
  const res = await POST(
    finalizeRequest({ homeScore: 5, awayScore: 3, inning: 7, isTopOfInning: false, deviceId: 'dev-1' }),
    { params: { gameId: GAME_ID } },
  );

  expect(res.status).toBe(200);
  expect(mockGetAuthorizedFinalizer).toHaveBeenCalledWith({ name: 'db' }, 'coach-1', GAME_ID);
  expect(mockFinalizeGame).toHaveBeenCalledWith({ name: 'db' }, {
    gameId: GAME_ID,
    userId: 'coach-1',
    clientHomeScore: 5,
    clientAwayScore: 3,
    inning: 7,
    isTopOfInning: false,
    deviceId: 'dev-1',
  });
});
