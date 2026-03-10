import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Sends a password reset email using a magic-link OTP.
 * Invite-only: verifies the email exists in user_profiles before sending.
 *
 * Uses signInWithOtp() (same proven flow as magic-link login) so the email
 * contains a proper auth code. The link redirects to /callback?type=recovery,
 * which exchanges the code for a session and then redirects to /set-password.
 *
 * POST /api/auth/send-reset-email
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

  // Use anon client with signInWithOtp — same proven flow as magic-link login.
  // This generates a proper auth code that the callback can exchange for a session.
  const anonDb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;
  const { error: otpError } = await anonDb.auth.signInWithOtp({
    email: normalizedEmail,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: `${appUrl}/callback?type=recovery`,
    },
  });

  if (otpError) {
    return NextResponse.json({ error: otpError.message }, { status: 400 });
  }

  return NextResponse.json({ sent: true });
}
