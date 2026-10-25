import { NextResponse } from 'next/server';
import { GET } from '../[tournamentId]/route';

const mockRequireApiUser = jest.fn();
const mockLoadTournament = jest.fn();
jest.mock('@/lib/api/bearer-auth', () => ({
  ...jest.requireActual('@/lib/api/bearer-auth'),
  requireApiUser: (req: Request) => mockRequireApiUser(req),
}));
jest.mock('@/lib/services/tournaments/load-tournament', () => ({ loadTournament: (...args: unknown[]) => mockLoadTournament(...args) }));

const DB = { name: 'db' };
const params = { params: { tournamentId: 'tr1' } };
const request = () => new Request('https://example.com/api/m/v1/tournaments/tr1', { headers: { authorization: 'Bearer token' } });

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireApiUser.mockResolvedValue({ user: { id: 'u1' }, db: DB });
  mockLoadTournament.mockResolvedValue({ ok: true, data: { tournament: { id: 'tr1' } } });
});

describe('GET /api/m/v1/tournaments/:tournamentId', () => {
  it('should respond 401 without calling the service', async () => {
    mockRequireApiUser.mockResolvedValue({ response: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) });
    expect((await GET(request(), params)).status).toBe(401);
    expect(mockLoadTournament).not.toHaveBeenCalled();
  });

  it('should load the tournament in the path, and map not found to 404', async () => {
    expect((await GET(request(), params)).status).toBe(200);
    expect(mockLoadTournament).toHaveBeenCalledWith(DB, 'u1', { tournamentId: 'tr1' });

    mockLoadTournament.mockResolvedValue({ ok: false, code: 'not_found', error: 'Tournament not found.' });
    expect((await GET(request(), params)).status).toBe(404);
  });
});
