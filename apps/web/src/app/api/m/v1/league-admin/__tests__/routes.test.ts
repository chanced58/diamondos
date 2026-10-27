import { NextResponse } from 'next/server';
import { GET as listRoute, POST as createRoute } from '../[leagueId]/players/route';
import { GET as playerRoute } from '../[leagueId]/players/[playerId]/route';
import { POST as transferRoute } from '../[leagueId]/players/[playerId]/transfer/route';
import { POST as releaseRoute } from '../[leagueId]/players/[playerId]/release/route';

const mockRequireApiUser = jest.fn();
const mockServices = {
  loadLeaguePlayers: jest.fn(),
  loadLeaguePlayer: jest.fn(),
  createLeaguePlayer: jest.fn(),
  transferLeaguePlayer: jest.fn(),
  releaseLeaguePlayer: jest.fn(),
};
jest.mock('@/lib/api/bearer-auth', () => ({
  ...jest.requireActual('@/lib/api/bearer-auth'),
  requireApiUser: (req: Request) => mockRequireApiUser(req),
}));
jest.mock('@/lib/services/league-admin/league-players', () => ({
  loadLeaguePlayers: (...args: unknown[]) => mockServices.loadLeaguePlayers(...args),
  loadLeaguePlayer: (...args: unknown[]) => mockServices.loadLeaguePlayer(...args),
  createLeaguePlayer: (...args: unknown[]) => mockServices.createLeaguePlayer(...args),
  transferLeaguePlayer: (...args: unknown[]) => mockServices.transferLeaguePlayer(...args),
  releaseLeaguePlayer: (...args: unknown[]) => mockServices.releaseLeaguePlayer(...args),
}));

const DB = { name: 'db' };
const request = (method = 'GET', body?: unknown) =>
  new Request('https://example.com/api/m/v1/league-admin/l1/players', {
    method,
    headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const league = { params: { leagueId: 'l1' } };
const player = { params: { leagueId: 'l1', playerId: 'p1' } };

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireApiUser.mockResolvedValue({ user: { id: 'u1' }, db: DB });
  for (const service of Object.values(mockServices)) service.mockResolvedValue({ ok: true, data: {} });
});

describe('league admin player routes', () => {
  it('should respond 401 without calling a service', async () => {
    mockRequireApiUser.mockResolvedValue({ response: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) });
    expect((await listRoute(request(), league)).status).toBe(401);
    expect((await createRoute(request('POST', {}), league)).status).toBe(401);
    expect((await playerRoute(request(), player)).status).toBe(401);
    expect((await transferRoute(request('POST', {}), player)).status).toBe(401);
    expect((await releaseRoute(request('POST', {}), player)).status).toBe(401);
    for (const service of Object.values(mockServices)) expect(service).not.toHaveBeenCalled();
  });

  it('should take the league and player from the path, not the body', async () => {
    await listRoute(request(), league);
    expect(mockServices.loadLeaguePlayers).toHaveBeenCalledWith(DB, 'u1', { leagueId: 'l1' });

    expect((await createRoute(request('POST', { firstName: 'Sam', leagueId: 'other' }), league)).status).toBe(201);
    expect(mockServices.createLeaguePlayer).toHaveBeenCalledWith(DB, 'u1', { firstName: 'Sam', leagueId: 'l1' });

    await playerRoute(request(), player);
    expect(mockServices.loadLeaguePlayer).toHaveBeenCalledWith(DB, 'u1', { leagueId: 'l1', playerId: 'p1' });

    await transferRoute(request('POST', { toTeamId: 't1', acceptJerseyClear: true, playerId: 'other' }), player);
    expect(mockServices.transferLeaguePlayer).toHaveBeenCalledWith(DB, 'u1', { toTeamId: 't1', acceptJerseyClear: true, leagueId: 'l1', playerId: 'p1' });

    await releaseRoute(request('POST', { reason: 'Moved' }), player);
    expect(mockServices.releaseLeaguePlayer).toHaveBeenCalledWith(DB, 'u1', { reason: 'Moved', leagueId: 'l1', playerId: 'p1' });
  });

  it('should map refusals to statuses', async () => {
    mockServices.transferLeaguePlayer.mockResolvedValue({ ok: false, code: 'conflict', error: 'This player is in a game in progress.' });
    mockServices.loadLeaguePlayers.mockResolvedValue({ ok: false, code: 'not_found', error: 'League not found.' });
    expect((await transferRoute(request('POST', {}), player)).status).toBe(409);
    expect((await listRoute(request(), league)).status).toBe(404);
  });
});
