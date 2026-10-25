/**
 * Bearer-token authentication for API routes called by the mobile app.
 *
 * The web app authenticates with Supabase session cookies; the mobile app
 * has no cookies and sends its Supabase access token instead:
 *
 *   Authorization: Bearer <access_token>
 *
 * `requireApiUser` verifies that token against Supabase Auth and hands back
 * the user plus a service-role client. Authorization (which teams the user
 * may act on) is the caller's job — usually a service in `lib/services/`, so
 * web server actions and mobile routes share one implementation.
 */
import { NextResponse } from 'next/server';
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';

export type ApiAuthResult =
  | { user: User; db: SupabaseClient; response?: never }
  | { response: NextResponse; user?: never; db?: never };

const BEARER_RE = /^Bearer\s+(\S+)\s*$/i;

/**
 * Every Supabase read behind the mobile API goes to the database. Next's data
 * cache otherwise keeps GET fetches made from route handlers — even
 * `force-dynamic` ones — so the token check and the reads would replay old
 * responses: a team the user just joined missing from `/me`, for one.
 */
export const noStoreFetch: typeof fetch = (input, init) => fetch(input, { ...init, cache: 'no-store' });

// Per-request server clients: no session storage or refresh timers, nothing cached.
const SERVER_AUTH_OPTIONS = {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: noStoreFetch },
} as const;

/** JSON error body shared by every mobile API route: `{ error, code? }`. */
export function apiError(status: number, error: string, code?: string): NextResponse {
  return NextResponse.json(code ? { error, code } : { error }, { status });
}

/** The access token from an `Authorization: Bearer` header, or null. */
export function readBearerToken(req: Request): string | null {
  const match = BEARER_RE.exec(req.headers.get('authorization') ?? '');
  return match ? match[1] : null;
}

export async function requireApiUser(req: Request): Promise<ApiAuthResult> {
  const token = readBearerToken(req);
  if (!token) return { response: apiError(401, 'Not authenticated', 'unauthenticated') };

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error('[bearer-auth] Supabase env vars are not configured');
    return { response: apiError(500, 'Internal error') };
  }

  const anonClient = createClient(supabaseUrl, anonKey, SERVER_AUTH_OPTIONS);
  const { data: { user }, error } = await anonClient.auth.getUser(token);
  if (error || !user) return { response: apiError(401, 'Not authenticated', 'unauthenticated') };

  return { user, db: createClient(supabaseUrl, serviceRoleKey, SERVER_AUTH_OPTIONS) };
}
