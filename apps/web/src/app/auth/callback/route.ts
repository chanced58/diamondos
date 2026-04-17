import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { type EmailOtpType } from '@supabase/supabase-js';
import { type NextRequest, NextResponse } from 'next/server';
import { processInvite } from '@/lib/auth/process-invite';

/**
 * Server-side auth callback route handler.
 *
 * Supabase redirects here after the user clicks a magic link or invite email.
 * Handles three delivery shapes so the app works regardless of which email
 * template the Supabase Dashboard is configured to use:
 *   1. PKCE code exchange  — ?code=xxx
 *   2. OTP token verify    — ?token_hash=xxx&type=magiclink
 *   3. Implicit flow       — #access_token=...&refresh_token=... (hash only)
 *
 * The hash variant is invisible to a server route, so on "no params" we
 * forward to /auth/callback/hash — a client page that extracts the hash
 * and POSTs the tokens to /api/auth/set-session, which writes HTTP-only
 * cookies and completes the flow.
 *
 * GET /auth/callback?code=xxx[&team=...&role=...&player=...&players=...]
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const VALID_OTP_TYPES: Set<string> = new Set<EmailOtpType>([
    'signup', 'invite', 'magiclink', 'recovery', 'email_change', 'email',
  ]);
  const rawType = searchParams.get('type');
  const type: EmailOtpType | null =
    rawType && VALID_OTP_TYPES.has(rawType) ? (rawType as EmailOtpType) : null;

  const teamId = searchParams.get('team');
  const role = searchParams.get('role');
  const playerId = searchParams.get('player');
  const playersParam = searchParams.get('players');
  const nextParam = searchParams.get('next') ?? '/dashboard';

  // Use the public app URL for redirects. In hosted environments like Render,
  // request.url resolves to the internal address (e.g. 0.0.0.0:PORT).
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? request.nextUrl.origin;

  const next = (nextParam.startsWith('/') && !nextParam.startsWith('//'))
    ? nextParam
    : '/dashboard';

  // Hash-fragment (implicit) flow: nothing for the server to read.
  // Forward to the client bridge, preserving the full original querystring
  // so invite params still reach /api/auth/set-session after the hash parse.
  if (!code && !(tokenHash && type)) {
    const hashBridge = new URL('/auth/callback/hash', origin);
    hashBridge.search = searchParams.toString();
    return NextResponse.redirect(hashBridge);
  }

  const redirectUrl = new URL(next, origin);
  const errorUrl = new URL('/login?error=auth_failed', origin);

  // Build the success response FIRST so Supabase can set cookies on it
  const response = NextResponse.redirect(redirectUrl);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: { name: string; value: string; options: CookieOptions }[],
        ) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      const isPkceError = error.message?.toLowerCase().includes('code verifier');
      console.error('[auth/callback] Code exchange failed:', error.message);
      const errorParam = isPkceError ? 'link_wrong_browser' : 'auth_failed';
      return NextResponse.redirect(
        new URL(`/login?error=${errorParam}`, origin),
      );
    }
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });
    if (error) {
      console.error('[auth/callback] Token verification failed:', error.message);
      return NextResponse.redirect(errorUrl);
    }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    await processInvite(user, { teamId, role, playerId, playersParam });
  }

  return response;
}
