import { NextResponse } from 'next/server';
import { GET, POST } from '../[leagueId]/scoring-settings/route';

const mockRequireApiUser = jest.fn();
const mockLoad = jest.fn();
const mockSave = jest.fn();
jest.mock('@/lib/api/bearer-auth', () => ({
  ...jest.requireActual('@/lib/api/bearer-auth'),
  requireApiUser: (req: Request) => mockRequireApiUser(req),
}));
jest.mock('@/lib/services/league-admin/league-scoring-settings', () => ({
  loadLeagueScoringSettings: (...args: unknown[]) => mockLoad(...args),
  saveLeagueScoringSettings: (...args: unknown[]) => mockSave(...args),
}));

const DB = { name: 'db' };
const request = (method = 'GET', body?: unknown) =>
  new Request('https://example.com/api/m/v1/league-admin/l1/scoring-settings', {
    method,
    headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const league = { params: { leagueId: 'l1' } };

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireApiUser.mockResolvedValue({ user: { id: 'u1' }, db: DB });
  mockLoad.mockResolvedValue({ ok: true, data: {} });
  mockSave.mockResolvedValue({ ok: true, data: {} });
});

describe('league admin scoring settings route', () => {
  it('should respond 401 without calling the service', async () => {
    mockRequireApiUser.mockResolvedValue({ response: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) });
    expect((await GET(request(), league)).status).toBe(401);
    expect((await POST(request('POST', {}), league)).status).toBe(401);
    expect(mockLoad).not.toHaveBeenCalled();
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('should take the league from the path', async () => {
    await GET(request(), league);
    expect(mockLoad).toHaveBeenCalledWith(DB, 'u1', { leagueId: 'l1' });

    await POST(request('POST', { settings: { a: 1 }, leagueId: 'other' }), league);
    expect(mockSave).toHaveBeenCalledWith(DB, 'u1', { settings: { a: 1 }, leagueId: 'l1' });
  });

  it('should map a refusal to its status', async () => {
    mockSave.mockResolvedValue({ ok: false, code: 'forbidden', error: 'Only league admins can change the scoring settings.' });
    const response = await POST(request('POST', { settings: {} }), league);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Only league admins can change the scoring settings.', code: 'forbidden' });
  });
});
