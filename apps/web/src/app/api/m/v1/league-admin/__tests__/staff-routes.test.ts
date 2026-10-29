import { NextResponse } from 'next/server';
import { GET } from '../[leagueId]/staff/route';
import { DELETE } from '../[leagueId]/staff/[staffId]/route';

const mockRequireApiUser = jest.fn();
const mockLoad = jest.fn();
const mockRemove = jest.fn();
jest.mock('@/lib/api/bearer-auth', () => ({
  ...jest.requireActual('@/lib/api/bearer-auth'),
  requireApiUser: (req: Request) => mockRequireApiUser(req),
}));
jest.mock('@/lib/services/league-admin/league-staff', () => ({
  loadLeagueStaff: (...args: unknown[]) => mockLoad(...args),
  removeLeagueStaff: (...args: unknown[]) => mockRemove(...args),
}));

const DB = { name: 'db' };
const request = (method = 'GET') =>
  new Request('https://example.com/api/m/v1/league-admin/l1/staff', { method, headers: { authorization: 'Bearer token' } });
const league = { params: { leagueId: 'l1' } };
const seat = { params: { leagueId: 'l1', staffId: 's1' } };

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireApiUser.mockResolvedValue({ user: { id: 'u1' }, db: DB });
  mockLoad.mockResolvedValue({ ok: true, data: {} });
  mockRemove.mockResolvedValue({ ok: true, data: {} });
});

describe('league admin staff routes', () => {
  it('should respond 401 without calling a service', async () => {
    mockRequireApiUser.mockResolvedValue({ response: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) });
    expect((await GET(request(), league)).status).toBe(401);
    expect((await DELETE(request('DELETE'), seat)).status).toBe(401);
    expect(mockLoad).not.toHaveBeenCalled();
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it('should take the league and seat from the path', async () => {
    await GET(request(), league);
    expect(mockLoad).toHaveBeenCalledWith(DB, 'u1', { leagueId: 'l1' });

    await DELETE(request('DELETE'), seat);
    expect(mockRemove).toHaveBeenCalledWith(DB, 'u1', { leagueId: 'l1', staffId: 's1' });
  });

  it('should map refusing an own seat to 409', async () => {
    mockRemove.mockResolvedValue({ ok: false, code: 'conflict', error: 'You can’t remove yourself from the league’s staff.' });
    const response = await DELETE(request('DELETE'), seat);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'You can’t remove yourself from the league’s staff.', code: 'conflict' });
  });
});
