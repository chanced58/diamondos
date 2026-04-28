import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { processInvite } from '@/lib/auth/process-invite';

/**
 * Accepts an access/refresh token pair extracted from an implicit-flow URL
 * hash fragment and converts it into HTTP-only session cookies on the
 * response, completing the magic-link sign-in server-side. Tokens arrived
 * originally from Supabase via the email verification redirect — same
 * trust level as the browser-client auto-detect path, but with atomic
 * cookie placement so middleware sees the session on the next request.
 */

// Cheap shape check: a JWT is three base64url segments separated by dots.
const JWT_SHAPE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin');
  const expectedOrigin = process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL;
  const secFetchSite = request.headers.get('sec-fetch-site');

  if (secFetchSite !== 'same-origin' && origin !== expectedOrigin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: {
    access_token?: unknown;
    refresh_token?: unknown;
    team?: unknown;
    role?: unknown;
    player?: unknown;
    players?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const accessToken = typeof body.access_token === 'string' ? body.access_token : '';
  const refreshToken = typeof body.refresh_token === 'string' ? body.refresh_token : '';

  if (!JWT_SHAPE.test(accessToken) || refreshToken.length === 0) {
    return NextResponse.json({ error: 'Invalid tokens' }, { status: 400 });
  }

  const response = NextResponse.json({ ok: true });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const { error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  // TEMP DIAG: remove after magic-link bounce bug is resolved
  console.log(
    '[auth/set-session] setSession',
    error ? `error: ${error.message}` : 'ok',
    'response cookies:',
    response.cookies.getAll().map((c) => c.name),
  );

  if (error) {
    console.error('[auth/set-session] setSession failed:', error.message);
    // Return a fresh NextResponse — not `response` — to avoid leaking any
    // cookies that setAll may have partially written before the failure.
    return NextResponse.json({ error: 'Session exchange failed' }, { status: 401 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    await processInvite(user, {
      teamId: typeof body.team === 'string' ? body.team : null,
      role: typeof body.role === 'string' ? body.role : null,
      playerId: typeof body.player === 'string' ? body.player : null,
      playersParam: typeof body.players === 'string' ? body.players : null,
    });
  }

  return response;
}
