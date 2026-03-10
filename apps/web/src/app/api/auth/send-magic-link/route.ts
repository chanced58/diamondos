import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Invite-only magic link endpoint — verifies the email exists in
 * user_profiles before sending the OTP email.
 *
 * POST /api/auth/send-magic-link
 * Body: { email: string }
 */
export async function POST(request: NextRequest) {
  const { email } = await request.json();
  if (!email) {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 });
  }

  const normalizedEmail = email.toLowerCase().trim();

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Invite-only: verify the email exists in user_profiles
  const { data: profile } = await db
    .from('user_profiles')
    .select('id')
    .eq('email', normalizedEmail)
    .maybeSingle();

  if (!profile) {
    return NextResponse.json(
      { error: 'This email is not registered on the platform. Contact your coach for an invite.' },
      { status: 403 },
    );
  }

  // Send the magic link via signInWithOtp (anon client — single auth call)
  const anonDb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  const { error: otpError } = await anonDb.auth.signInWithOtp({
    email: normalizedEmail,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin}/callback`,
    },
  });

  if (otpError) {
    // Surface a friendlier message for Supabase's rate limit
    const isRateLimit = otpError.message?.toLowerCase().includes('security purposes');
    return NextResponse.json(
      { error: isRateLimit
          ? 'Please wait 60 seconds before requesting another sign-in link.'
          : otpError.message },
      { status: isRateLimit ? 429 : 400 },
    );
  }

  return NextResponse.json({ sent: true });
}
