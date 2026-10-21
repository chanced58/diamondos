/**
 * Mobile bootstrap: who the caller is and what they can do.
 *
 * Returns team memberships (role, player id, tournament flag), each team's
 * subscription tier and the features it grants, and the caller's league
 * staff roles — see `meResponseSchema` in `@baseball/shared` for the
 * contract. Runs the web shell's membership/channel self-healing first.
 *
 * Auth: Supabase JWT in the Authorization header (see lib/api/bearer-auth).
 */
import { NextResponse } from 'next/server';
import { apiError, requireApiUser } from '@/lib/api/bearer-auth';
import { loadMe } from '@/lib/services/me/load-me';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  try {
    const me = await loadMe(auth.db, auth.user);
    return NextResponse.json(me, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error(`[m/v1/me] user=${auth.user.id} failed:`, err);
    return apiError(500, 'Internal error');
  }
}
