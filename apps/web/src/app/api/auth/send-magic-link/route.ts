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

  // Send the magic link email via admin API
  const { error: linkError } = await db.auth.admin.generateLink({
    type: 'magiclink',
    email: normalizedEmail,
  });

  if (linkError) {
    return NextResponse.json(
      { error: linkError.message },
      { status: 400 },
    );
  }

  // Use signInWithOtp to actually send the email (generateLink doesn't send)
  // We need a separate anon client for this
  const { createClient: createAnonClient } = await import('@supabase/supabase-js');
  const anonDb = createAnonClient(
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
    return NextResponse.json(
      { error: otpError.message },
      { status: 400 },
    );
  }

  return NextResponse.json({ sent: true });
}
