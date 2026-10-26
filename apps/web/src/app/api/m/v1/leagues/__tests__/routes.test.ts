import { NextResponse } from 'next/server';
import { GET as homeRoute } from '../[slug]/home/route';
import { GET as teamRoute } from '../[slug]/teams/[teamId]/route';

const mockRequireApiUser = jest.fn();
const mockHome = jest.fn();
const mockTeam = jest.fn();
jest.mock('@/lib/api/bearer-auth', () => ({
  ...jest.requireActual('@/lib/api/bearer-auth'),
  requireApiUser: (req: Request) => mockRequireApiUser(req),
}));
jest.mock('@/lib/services/league-home/load-league-home', () => ({ loadLeagueHome: (...args: unknown[]) => mockHome(...args) }));
jest.mock('@/lib/services/league-home/load-league-team', () => ({ loadLeagueTeam: (...args: unknown[]) => mockTeam(...args) }));

const DB = { name: 'db' };
const request = (query = '') => new Request(`https://example.com/api/m/v1/leagues/idaho-2a/home${query}`, { headers: { authorization: 'Bearer token' } });

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireApiUser.mockResolvedValue({ user: { id: 'u1' }, db: DB });
  mockHome.mockResolvedValue({ ok: true, data: {} });
  mockTeam.mockResolvedValue({ ok: true, data: {} });
});

describe('league home routes', () => {
  it('should respond 401 to both without calling a service', async () => {
    mockRequireApiUser.mockResolvedValue({ response: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) });
    expect((await homeRoute(request(), { params: { slug: 'idaho-2a' } })).status).toBe(401);
    expect((await teamRoute(request(), { params: { slug: 'idaho-2a', teamId: 't1' } })).status).toBe(401);
    expect(mockHome).not.toHaveBeenCalled();
    expect(mockTeam).not.toHaveBeenCalled();
  });

  it('should pass the slug and team from the path and the season and viewer team from the query', async () => {
    await homeRoute(request('?season=2025&teamId=t9'), { params: { slug: 'idaho-2a' } });
    expect(mockHome).toHaveBeenCalledWith(DB, 'u1', { slug: 'idaho-2a', season: '2025', teamId: 't9' });

    await homeRoute(request(), { params: { slug: 'idaho-2a' } });
    expect(mockHome).toHaveBeenLastCalledWith(DB, 'u1', { slug: 'idaho-2a', season: undefined, teamId: undefined });

    await teamRoute(request('?season=2025'), { params: { slug: 'idaho-2a', teamId: 't1' } });
    expect(mockTeam).toHaveBeenCalledWith(DB, 'u1', { slug: 'idaho-2a', teamId: 't1', season: '2025' });
  });

  it("should keep both routes' fetches out of Next's data cache", async () => {
    const home = await import('../[slug]/home/route');
    const team = await import('../[slug]/teams/[teamId]/route');
    expect(home.fetchCache).toBe('force-no-store');
    expect(team.fetchCache).toBe('force-no-store');
  });

  it('should map not found to 404', async () => {
    mockHome.mockResolvedValue({ ok: false, code: 'not_found', error: 'League not found.' });
    expect((await homeRoute(request(), { params: { slug: 'nope' } })).status).toBe(404);
  });
});
