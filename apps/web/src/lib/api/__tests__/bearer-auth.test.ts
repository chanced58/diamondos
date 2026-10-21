import { NextRequest } from 'next/server';
import { readBearerToken, requireApiUser } from '../bearer-auth';

const mockGetUser = jest.fn();
const mockCreateClient = jest.fn((_url: string, key: string) => ({
  key,
  auth: { getUser: mockGetUser },
}));

jest.mock('@supabase/supabase-js', () => ({
  createClient: (url: string, key: string) => mockCreateClient(url, key),
}));

function requestWith(authorization?: string): NextRequest {
  return new NextRequest('https://example.com/api/m/v1/me', {
    headers: authorization ? { authorization } : {},
  });
}

const ORIGINAL_ENV = process.env;

beforeEach(() => {
  jest.clearAllMocks();
  process.env = {
    ...ORIGINAL_ENV,
    NEXT_PUBLIC_SUPABASE_URL: 'https://db.example.com',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
    SUPABASE_SERVICE_ROLE_KEY: 'service-key',
  };
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
});

describe('readBearerToken', () => {
  it('should read the token from a Bearer header regardless of scheme case', () => {
    expect(readBearerToken(requestWith('Bearer abc.def'))).toBe('abc.def');
    expect(readBearerToken(requestWith('bearer abc.def'))).toBe('abc.def');
  });

  it('should return null for a missing header, another scheme, or an empty token', () => {
    expect(readBearerToken(requestWith())).toBeNull();
    expect(readBearerToken(requestWith('Basic dXNlcjpwYXNz'))).toBeNull();
    expect(readBearerToken(requestWith('Bearer '))).toBeNull();
    expect(readBearerToken(requestWith('abc.def'))).toBeNull();
  });
});

describe('requireApiUser', () => {
  it('should respond 401 without calling Supabase when there is no token', async () => {
    const result = await requireApiUser(requestWith());

    expect(result.response?.status).toBe(401);
    expect(await result.response?.json()).toEqual({ error: 'Not authenticated', code: 'unauthenticated' });
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  it('should respond 401 when Supabase rejects the token', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'jwt expired' } });

    const result = await requireApiUser(requestWith('Bearer expired'));

    expect(mockGetUser).toHaveBeenCalledWith('expired');
    expect(result.response?.status).toBe(401);
  });

  it('should return the user and a service-role client for a valid token', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });

    const result = await requireApiUser(requestWith('Bearer good'));

    expect(result.response).toBeUndefined();
    expect(result.user).toEqual({ id: 'user-1' });
    expect(result.db).toMatchObject({ key: 'service-key' });
    // Token verified with the anon key, never the service role.
    expect(mockCreateClient).toHaveBeenNthCalledWith(1, 'https://db.example.com', 'anon-key');
  });

  it('should respond 500 when the service-role key is not configured', async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    const result = await requireApiUser(requestWith('Bearer good'));

    expect(result.response?.status).toBe(500);
    expect(mockGetUser).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
