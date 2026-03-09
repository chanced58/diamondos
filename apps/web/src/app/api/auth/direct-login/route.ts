import { createClient } from '@supabase/supabase-js';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Direct login endpoint — generates a magic link via admin API and
 * immediately exchanges it for a session, bypassing email delivery.
 *
 * POST /api/auth/direct-login
 * Body: { email: string }
 */
export async function POST(request: NextRequest) {
  const { email } = await request.json();
  if (!email) {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 });
  }

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Invite-only: verify the email exists in user_profiles
  const { data: profile } = await db
    .from('user_profiles')
    .select('id')
    .eq('email', email.toLowerCase().trim())
    .maybeSingle();

  if (!profile) {
    return NextResponse.json(
      { error: 'This email is not registered on the platform. Contact your coach for an invite.' },
      { status: 403 },
    );
  }

  // Generate a magic link without sending an email
  const { data: linkData, error: linkError } = await db.auth.admin.generateLink({
    type: 'magiclink',
    email: email.toLowerCase().trim(),
  });

  if (linkError || !linkData) {
    return NextResponse.json(
      { error: linkError?.message ?? 'Failed to generate link' },
      { status: 400 },
    );
  }

  // Extract token_hash from the properties or from the action_link URL
  let tokenHash: string | null = (linkData.properties as Record<string, unknown>).hashed_token as string ?? null;

  if (!tokenHash) {
    // Fallback: parse from the action_link URL
    try {
      const linkUrl = new URL(linkData.properties.action_link);
      tokenHash = linkUrl.searchParams.get('token_hash');
      // Some Supabase versions put it in the fragment
      if (!tokenHash && linkUrl.hash) {
        const hashParams = new URLSearchParams(linkUrl.hash.substring(1));
        tokenHash = hashParams.get('token_hash');
      }
    } catch {
      // ignore parse errors
    }
  }

  if (!tokenHash) {
    return NextResponse.json(
      { error: 'Could not extract token from generated link. Debug: ' + JSON.stringify(linkData.properties) },
      { status: 500 },
    );
  }

  // Use the OTP to verify and create a session
  const successResponse = NextResponse.json({ success: true });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value, options }) =>
            successResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const { error: verifyError } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: 'magiclink',
  });

  if (verifyError) {
    return NextResponse.json(
      { error: `Session error: ${verifyError.message}` },
      { status: 400 },
    );
  }

  return successResponse;
}
