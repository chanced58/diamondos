import { NextResponse } from 'next/server';
import { GET } from '../dashboard/route';

const mockRequireApiUser = jest.fn();
const mockLoadDashboard = jest.fn();
jest.mock('@/lib/api/bearer-auth', () => ({
  ...jest.requireActual('@/lib/api/bearer-auth'),
  requireApiUser: (req: Request) => mockRequireApiUser(req),
}));
jest.mock('@/lib/services/dashboard/load-dashboard', () => ({ loadDashboard: (...args: unknown[]) => mockLoadDashboard(...args) }));

const DB = { name: 'db' };
const team = { params: { teamId: 't1' } };
const request = (url = 'https://example.com/api/m/v1/teams/t1/dashboard') =>
  new Request(url, { headers: { authorization: 'Bearer token' } });

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireApiUser.mockResolvedValue({ user: { id: 'u1' }, db: DB });
  mockLoadDashboard.mockResolvedValue({ ok: true, data: { teamId: 't1' } });
});

describe('GET /api/m/v1/teams/:teamId/dashboard', () => {
  it('should respond 401 without calling the service', async () => {
    mockRequireApiUser.mockResolvedValue({ response: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) });
    expect((await GET(request(), team)).status).toBe(401);
    expect(mockLoadDashboard).not.toHaveBeenCalled();
  });

  it('should pass the team from the path and the view from the query', async () => {
    const response = await GET(request('https://example.com/api/m/v1/teams/t1/dashboard?view=league'), team);
    expect(response.status).toBe(200);
    expect(mockLoadDashboard).toHaveBeenCalledWith(DB, 'u1', { teamId: 't1', view: 'league' });

    await GET(request(), team);
    expect(mockLoadDashboard).toHaveBeenLastCalledWith(DB, 'u1', { teamId: 't1', view: null });
  });

  it("should answer 404 for a team the viewer isn't on", async () => {
    mockLoadDashboard.mockResolvedValue({ ok: false, code: 'not_found', error: 'Team not found.' });
    expect((await GET(request(), team)).status).toBe(404);
  });
});
