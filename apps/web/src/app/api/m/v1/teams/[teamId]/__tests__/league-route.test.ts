import { NextResponse } from 'next/server';
import { GET } from '../league/route';

const mockRequireApiUser = jest.fn();
const mockLoadLeaguePage = jest.fn();
jest.mock('@/lib/api/bearer-auth', () => ({
  ...jest.requireActual('@/lib/api/bearer-auth'),
  requireApiUser: (req: Request) => mockRequireApiUser(req),
}));
jest.mock('@/lib/services/league/load-league-page', () => ({ loadLeaguePage: (...args: unknown[]) => mockLoadLeaguePage(...args) }));

const DB = { name: 'db' };
const team = { params: { teamId: 't1' } };
const request = () => new Request('https://example.com/api/m/v1/teams/t1/league', { headers: { authorization: 'Bearer token' } });

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireApiUser.mockResolvedValue({ user: { id: 'u1' }, db: DB });
  mockLoadLeaguePage.mockResolvedValue({ ok: true, data: { league: { id: 'l1' } } });
});

describe('GET /api/m/v1/teams/:teamId/league', () => {
  it('should respond 401 without calling the service', async () => {
    mockRequireApiUser.mockResolvedValue({ response: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) });
    expect((await GET(request(), team)).status).toBe(401);
    expect(mockLoadLeaguePage).not.toHaveBeenCalled();
  });

  it('should load the league of the team in the path, and map not found to 404', async () => {
    expect((await GET(request(), team)).status).toBe(200);
    expect(mockLoadLeaguePage).toHaveBeenCalledWith(DB, 'u1', { teamId: 't1' });

    mockLoadLeaguePage.mockResolvedValue({ ok: false, code: 'not_found', error: 'This team is not in a league.' });
    expect((await GET(request(), team)).status).toBe(404);
  });
});
