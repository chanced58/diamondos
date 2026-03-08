import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Sends a password reset email.
 * Invite-only: verifies the email exists in user_profiles before sending.
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

  const origin = request.nextUrl.origin;
  const { error } = await db.auth.resetPasswordForEmail(normalizedEmail, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? origin}/callback?type=recovery`,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ sent: true });
}
