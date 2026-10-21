import { NextResponse } from 'next/server';
import { GET } from '../route';

const mockRequireApiUser = jest.fn();
const mockLoadMe = jest.fn();

jest.mock('@/lib/api/bearer-auth', () => ({
  ...jest.requireActual('@/lib/api/bearer-auth'),
  requireApiUser: (req: Request) => mockRequireApiUser(req),
}));
jest.mock('@/lib/services/me/load-me', () => ({
  loadMe: (...args: unknown[]) => mockLoadMe(...args),
}));

const request = () => new Request('https://example.com/api/m/v1/me', {
  headers: { authorization: 'Bearer token' },
});

beforeEach(() => {
  jest.clearAllMocks();
});

it('should respond 401 when the bearer token is missing or invalid', async () => {
  mockRequireApiUser.mockResolvedValue({
    response: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }),
  });

  const res = await GET(request());

  expect(res.status).toBe(401);
  expect(mockLoadMe).not.toHaveBeenCalled();
});

it('should respond 200 with the payload for the authenticated user', async () => {
  const user = { id: 'user-1', email: 'coach@example.com' };
  const db = { name: 'db' };
  const payload = { apiVersion: 1, user: { id: 'user-1' }, memberships: [], leagueRoles: [] };
  mockRequireApiUser.mockResolvedValue({ user, db });
  mockLoadMe.mockResolvedValue(payload);

  const res = await GET(request());

  expect(res.status).toBe(200);
  expect(res.headers.get('cache-control')).toBe('no-store');
  expect(await res.json()).toEqual(payload);
  expect(mockLoadMe).toHaveBeenCalledWith(db, user);
});

it('should respond 500 without leaking the failure when loading throws', async () => {
  mockRequireApiUser.mockResolvedValue({ user: { id: 'user-1' }, db: {} });
  mockLoadMe.mockRejectedValue(new Error('team_members read failed: secret detail'));
  const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

  const res = await GET(request());

  expect(res.status).toBe(500);
  expect(await res.json()).toEqual({ error: 'Internal error' });
  consoleError.mockRestore();
});
