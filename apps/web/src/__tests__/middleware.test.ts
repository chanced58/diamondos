import { NextRequest } from 'next/server';
import { middleware } from '../middleware';

jest.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: { getUser: () => Promise.resolve({ data: { user: null }, error: null }) },
  }),
}));

const ORIGINAL_ENV = process.env;

beforeEach(() => {
  process.env = {
    ...ORIGINAL_ENV,
    NEXT_PUBLIC_SUPABASE_URL: 'https://db.example.com',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
  };
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
});

function requestFor(pathname: string): NextRequest {
  return new NextRequest(`https://example.com${pathname}`);
}

describe('middleware for a signed-out visitor', () => {
  it.each(['/practices', '/league/admin', '/players/me'])(
    'should redirect %s to /login with the path to return to',
    async (pathname) => {
      const response = await middleware(requestFor(pathname));

      expect(response.status).toBe(307);
      const location = new URL(response.headers.get('location') ?? '');
      expect(location.pathname).toBe('/login');
      expect(location.searchParams.get('redirectTo')).toBe(pathname);
    },
  );

  it.each(['/players/signup', '/l/some-league'])('should let %s through', async (pathname) => {
    const response = await middleware(requestFor(pathname));

    expect(response.headers.get('location')).toBeNull();
    expect(response.status).toBe(200);
  });
});
