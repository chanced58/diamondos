import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Invite-only magic link endpoint.
 * Verifies the email exists in user_profiles, then sends the OTP
 * server-side. The email template uses token_hash directly so no
 * PKCE code_verifier cookie is needed.
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

  // Send OTP server-side (single email, no PKCE cookie needed since
  // the email template uses token_hash directly)
  const { error: otpError } = await db.auth.signInWithOtp({
    email: normalizedEmail,
    options: {
      shouldCreateUser: false,
    },
  });

  if (otpError) {
    const isRateLimit = otpError.message?.toLowerCase().includes('security purposes');
    console.error('[send-magic-link] signInWithOtp failed:', otpError.message);
    return NextResponse.json(
      {
        error: isRateLimit
          ? 'Please wait 60 seconds before requesting another sign-in link.'
          : 'Failed to send sign-in link. Please try again.',
      },
      { status: isRateLimit ? 429 : 500 },
    );
  }

  return NextResponse.json({ sent: true });
}
