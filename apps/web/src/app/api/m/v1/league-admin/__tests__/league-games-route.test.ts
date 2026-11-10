import { NextResponse } from 'next/server';
import { GET, POST } from '../[leagueId]/games/route';

const mockRequireApiUser = jest.fn();
const mockListLeagueGames = jest.fn();
const mockCreateLeagueGame = jest.fn();
jest.mock('@/lib/api/bearer-auth', () => ({
  ...jest.requireActual('@/lib/api/bearer-auth'),
  requireApiUser: (req: Request) => mockRequireApiUser(req),
}));
jest.mock('@/lib/services/league-games/league-games', () => ({
  listLeagueGames: (...args: unknown[]) => mockListLeagueGames(...args),
  createLeagueGame: (...args: unknown[]) => mockCreateLeagueGame(...args),
}));

const DB = { name: 'db' };
const request = (method = 'GET', body?: unknown, query = '') =>
  new Request(`https://example.com/api/m/v1/league-admin/l1/games${query}`, {
    method,
    headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const league = { params: { leagueId: 'l1' } };

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireApiUser.mockResolvedValue({ user: { id: 'u1' }, db: DB });
  mockListLeagueGames.mockResolvedValue({ ok: true, data: { games: [] } });
  mockCreateLeagueGame.mockResolvedValue({ ok: true, data: { leagueGameId: 'g1' } });
});

describe('league admin games route', () => {
  it('should respond 401 without calling a service', async () => {
    mockRequireApiUser.mockResolvedValue({ response: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) });
    expect((await GET(request(), league)).status).toBe(401);
    expect((await POST(request('POST', {}), league)).status).toBe(401);
    expect(mockListLeagueGames).not.toHaveBeenCalled();
    expect(mockCreateLeagueGame).not.toHaveBeenCalled();
  });

  it('should list league games for staff', async () => {
    const response = await GET(request(), league);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ games: [] });
    expect(mockListLeagueGames).toHaveBeenCalledWith(DB, 'u1', { leagueId: 'l1' });
  });

  it('should pass the season filter through', async () => {
    await GET(request('GET', undefined, '?season=Spring%202027'), league);
    expect(mockListLeagueGames).toHaveBeenCalledWith(DB, 'u1', { leagueId: 'l1', season: 'Spring 2027' });
  });

  it('should take the league from the path when creating a game', async () => {
    const response = await POST(request('POST', { homeTeamId: 'a', awayTeamId: 'b', leagueId: 'other' }), league);
    expect(response.status).toBe(201);
    expect(mockCreateLeagueGame).toHaveBeenCalledWith(DB, 'u1', { homeTeamId: 'a', awayTeamId: 'b', leagueId: 'l1' });
  });

  it('should map a refusal to its status', async () => {
    mockCreateLeagueGame.mockResolvedValue({ ok: false, code: 'forbidden', error: 'Only league admins can change league games.' });
    expect((await POST(request('POST', {}), league)).status).toBe(403);
  });
});
