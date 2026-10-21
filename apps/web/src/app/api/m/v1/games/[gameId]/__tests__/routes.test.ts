import { NextResponse } from 'next/server';
import { GET as getDetail } from '../route';
import { POST as postCancel } from '../cancel/route';
import { POST as postReset } from '../reset/route';
import { POST as postRecalculate } from '../recalculate/route';
import { POST as postOverride } from '../../../reconciliations/[reconciliationId]/overrides/route';

const mockRequireApiUser = jest.fn();
const mockLoadGameDetail = jest.fn();
const mockCancelGame = jest.fn();
const mockResetGame = jest.fn();
const mockRecalculateScores = jest.fn();
const mockResolveConflict = jest.fn();

jest.mock('@/lib/api/bearer-auth', () => ({
  ...jest.requireActual('@/lib/api/bearer-auth'),
  requireApiUser: (req: Request) => mockRequireApiUser(req),
}));
jest.mock('@/lib/services/games/load-game-detail', () => ({
  loadGameDetail: (...args: unknown[]) => mockLoadGameDetail(...args),
}));
jest.mock('@/lib/services/games/cancel-game', () => ({
  cancelGame: (...args: unknown[]) => mockCancelGame(...args),
}));
jest.mock('@/lib/services/games/reset-game', () => ({
  resetGame: (...args: unknown[]) => mockResetGame(...args),
}));
jest.mock('@/lib/services/games/recalculate-scores', () => ({
  recalculateScores: (...args: unknown[]) => mockRecalculateScores(...args),
}));
jest.mock('@/lib/services/games/resolve-reconciliation-conflict', () => ({
  resolveReconciliationConflict: (...args: unknown[]) => mockResolveConflict(...args),
}));

const DB = { name: 'db' };
const gameParams = { params: { gameId: 'game-1' } };

function request(method: 'GET' | 'POST', body?: unknown): Request {
  return new Request('https://example.com/api/m/v1/x', {
    method,
    headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireApiUser.mockResolvedValue({ user: { id: 'coach-1' }, db: DB });
});

it('should respond 401 from every route without calling a service when unauthenticated', async () => {
  mockRequireApiUser.mockResolvedValue({
    response: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }),
  });

  const responses = await Promise.all([
    getDetail(request('GET'), gameParams),
    postCancel(request('POST', {}), gameParams),
    postReset(request('POST', {}), gameParams),
    postRecalculate(request('POST'), gameParams),
    postOverride(request('POST', {}), { params: { reconciliationId: 'recon-1' } }),
  ]);

  expect(responses.map((r) => r.status)).toEqual([401, 401, 401, 401, 401]);
  for (const service of [mockLoadGameDetail, mockCancelGame, mockResetGame, mockRecalculateScores, mockResolveConflict]) {
    expect(service).not.toHaveBeenCalled();
  }
});

it('should return the game detail for the bearer user', async () => {
  mockLoadGameDetail.mockResolvedValue({ ok: true, data: { game: { id: 'game-1' } } });

  const res = await getDetail(request('GET'), gameParams);

  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ game: { id: 'game-1' } });
  expect(mockLoadGameDetail).toHaveBeenCalledWith(DB, 'coach-1', { gameId: 'game-1' });
});

it('should map a hidden game to 404', async () => {
  mockLoadGameDetail.mockResolvedValue({ ok: false, code: 'not_found', error: 'Game not found.' });
  expect((await getDetail(request('GET'), gameParams)).status).toBe(404);
});

it('should pass the cancel notify flag through from the body', async () => {
  mockCancelGame.mockResolvedValue({ ok: true, data: { gameId: 'game-1' } });

  const res = await postCancel(request('POST', { notifyTeam: true }), gameParams);

  expect(res.status).toBe(200);
  expect(mockCancelGame).toHaveBeenCalledWith(DB, 'coach-1', { gameId: 'game-1', notifyTeam: true });
});

it('should map a forbidden cancel to 403', async () => {
  mockCancelGame.mockResolvedValue({ ok: false, code: 'forbidden', error: 'Only coaches can perform this action.' });
  const res = await postCancel(request('POST', {}), gameParams);
  expect(res.status).toBe(403);
  expect(await res.json()).toEqual({ error: 'Only coaches can perform this action.', code: 'forbidden' });
});

it('should record the device id on a reset, falling back to "mobile"', async () => {
  mockResetGame.mockResolvedValue({ ok: true, data: { gameId: 'game-1' } });

  await postReset(request('POST', { deviceId: 'device-9' }), gameParams);
  await postReset(request('POST', { deviceId: 42 }), gameParams);

  expect(mockResetGame).toHaveBeenNthCalledWith(1, DB, 'coach-1', { gameId: 'game-1' }, 'device-9');
  expect(mockResetGame).toHaveBeenNthCalledWith(2, DB, 'coach-1', { gameId: 'game-1' }, 'mobile');
});

it('should map a reset of an unstarted game to 409', async () => {
  mockResetGame.mockResolvedValue({ ok: false, code: 'conflict', error: 'Game is already in scheduled state.' });
  expect((await postReset(request('POST', {}), gameParams)).status).toBe(409);
});

it('should return the recalculated scores', async () => {
  mockRecalculateScores.mockResolvedValue({ ok: true, data: { gameId: 'game-1', homeScore: 3, awayScore: 1 } });

  const res = await postRecalculate(request('POST'), gameParams);

  expect(await res.json()).toEqual({ gameId: 'game-1', homeScore: 3, awayScore: 1 });
});

it('should pass the override choice through and hide database detail on failure', async () => {
  mockResolveConflict.mockResolvedValue({ ok: false, code: 'failed', error: 'Failed to save override: secret' });

  const res = await postOverride(
    request('POST', { conflictKey: 'final_score:home', useAwayValue: true }),
    { params: { reconciliationId: 'recon-1' } },
  );

  expect(res.status).toBe(500);
  expect(await res.json()).toEqual({ error: 'Internal error', code: 'failed' });
  expect(mockResolveConflict).toHaveBeenCalledWith(DB, 'coach-1', {
    reconciliationId: 'recon-1', conflictKey: 'final_score:home', useAwayValue: true,
  });
});
