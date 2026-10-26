import { NextResponse } from 'next/server';
import { GET as progressRoute } from '../route';
import { POST as completeRoute } from '../[slug]/complete/route';

const mockRequireApiUser = jest.fn();
const mockLoad = jest.fn();
const mockComplete = jest.fn();
jest.mock('@/lib/api/bearer-auth', () => ({
  ...jest.requireActual('@/lib/api/bearer-auth'),
  requireApiUser: (req: Request) => mockRequireApiUser(req),
}));
jest.mock('@/lib/services/training/training', () => ({
  loadTrainingProgress: (...args: unknown[]) => mockLoad(...args),
  completeTrainingModule: (...args: unknown[]) => mockComplete(...args),
}));

const DB = { name: 'db' };
const request = (method = 'GET') => new Request('https://example.com/api/m/v1/training', { method, headers: { authorization: 'Bearer token' } });

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireApiUser.mockResolvedValue({ user: { id: 'u1' }, db: DB });
  mockLoad.mockResolvedValue({ ok: true, data: {} });
  mockComplete.mockResolvedValue({ ok: true, data: {} });
});

describe('training routes', () => {
  it('should respond 401 to both without calling a service', async () => {
    mockRequireApiUser.mockResolvedValue({ response: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) });
    expect((await progressRoute(request())).status).toBe(401);
    expect((await completeRoute(request('POST'), { params: { slug: 'getting-started' } })).status).toBe(401);
    expect(mockLoad).not.toHaveBeenCalled();
    expect(mockComplete).not.toHaveBeenCalled();
  });

  it("should read the caller's progress and complete the module in the path", async () => {
    await progressRoute(request());
    expect(mockLoad).toHaveBeenCalledWith(DB, 'u1');
    await completeRoute(request('POST'), { params: { slug: 'getting-started' } });
    expect(mockComplete).toHaveBeenCalledWith(DB, 'u1', { slug: 'getting-started' });
  });

  it('should map an unknown module to 404', async () => {
    mockComplete.mockResolvedValue({ ok: false, code: 'not_found', error: 'Unknown module.' });
    expect((await completeRoute(request('POST'), { params: { slug: 'nope' } })).status).toBe(404);
  });
});
