import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Supabase Auth session refresh middleware.
 * Refreshes the session cookie on every request so Server Components
 * always receive a valid session.
 */
export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

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
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Refresh session (do not remove this line)
  const { data: { user }, error } = await supabase.auth.getUser();

  // TEMP DIAG: remove after magic-link bounce bug is resolved.
  // Surfaces which sb-* cookies arrived and whether getUser rejected them.
  const sbCookies = request.cookies
    .getAll()
    .filter((c) => c.name.startsWith('sb-'))
    .map((c) => ({ name: c.name, len: c.value.length }));
  console.log(
    '[middleware]',
    request.nextUrl.pathname,
    'sbCookies:', sbCookies,
    'user:', user?.id ?? null,
    'error:', error?.message ?? null,
  );

  // Redirect unauthenticated users from protected routes to login
  const pathname = request.nextUrl.pathname;
  const isProtectedRoute = pathname.startsWith('/dashboard') ||
    pathname.startsWith('/teams') ||
    pathname.startsWith('/games') ||
    pathname.startsWith('/compliance') ||
    pathname.startsWith('/messages') ||
    pathname.startsWith('/admin');

  if (!user && isProtectedRoute) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/login';
    redirectUrl.searchParams.set('redirectTo', pathname);
    return NextResponse.redirect(redirectUrl);
  }

  // Redirect authenticated users away from login to dashboard (prevents loop)
  if (user && pathname === '/login') {
    const redirectUrl = request.nextUrl.clone();
    const redirectTo = redirectUrl.searchParams.get('redirectTo') ?? '/dashboard';
    redirectUrl.pathname = redirectTo;
    redirectUrl.search = '';
    return NextResponse.redirect(redirectUrl);
  }

  // Track the active team environment via cookie when visiting /teams/[teamId]/*
  const teamMatch = pathname.match(/^\/teams\/([^/]+)/);
  if (teamMatch) {
    supabaseResponse.cookies.set('active-team-id', teamMatch[1], {
      path: '/',
      httpOnly: false,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/health|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
