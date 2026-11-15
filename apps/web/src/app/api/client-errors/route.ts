/**
 * Record client-side errors reported by the web app. Anonymous callers get a
 * 204 without a write, so a signed-out error never produces a failing request.
 */
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { apiError } from '@/lib/api/bearer-auth';
import { readJsonBody, serviceResponse } from '@/lib/api/service-response';
import { recordClientErrors } from '@/lib/services/errors/record-client-errors';
import { createServerClient } from '@/lib/supabase/server';

/** The signed-in user, or null for anonymous callers and any session lookup failure. */
async function readSessionUser() {
  try {
    const {
      data: { user },
    } = await createServerClient().auth.getUser();
    return user;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const user = await readSessionUser();
  if (!user) return new NextResponse(null, { status: 204 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return apiError(500, 'Internal error', 'failed');

  const db = createClient(url, serviceRoleKey, { global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }) } });
  const result = await recordClientErrors(db, user.id, await readJsonBody(req), 'web_client');
  if (!result.ok) return serviceResponse(result);
  return new NextResponse(null, { status: 204 });
}
