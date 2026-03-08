import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Marks the current user's has_set_password flag as true.
 * Called by the set-password page after a successful password update.
 *
 * POST /api/auth/mark-password-set
 */
export async function POST(request: NextRequest) {
  // Resolve the authenticated user from session cookies
  const anonClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll() {
          // No cookie mutations needed for this read-only session check
        },
      },
    },
  );

  const { data: { user } } = await anonClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  await db
    .from('user_profiles')
    .update({ has_set_password: true })
    .eq('id', user.id);

  return NextResponse.json({ ok: true });
}
