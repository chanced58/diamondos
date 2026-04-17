import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { HANDLE_REGEX } from '@baseball/shared';

/**
 * Self-signup endpoint for Player Pro accounts.
 *
 * Differs from send-magic-link (invite-only): this allows new user creation
 * when the email is not yet registered. Stashes first name, last name, and
 * the requested handle in user_metadata so the auth callback can provision
 * the player_profiles row once the magic link is clicked.
 *
 * POST /api/auth/player-signup
 * Body: { email, firstName, lastName, handle, graduationYear? }
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const { email, firstName, lastName, handle, graduationYear } = body;

  if (typeof email !== 'string' || !email.trim()) {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 });
  }
  if (typeof firstName !== 'string' || !firstName.trim() || typeof lastName !== 'string' || !lastName.trim()) {
    return NextResponse.json({ error: 'First and last name are required' }, { status: 400 });
  }
  if (typeof handle !== 'string' || !handle.trim()) {
    return NextResponse.json({ error: 'Handle is required' }, { status: 400 });
  }

  const normalizedEmail = email.toLowerCase().trim();
  const normalizedHandle = handle.toLowerCase().trim();
  const normalizedFirstName = firstName.trim();
  const normalizedLastName = lastName.trim();

  let normalizedGradYear: number | undefined;
  if (graduationYear !== undefined && graduationYear !== null && graduationYear !== '') {
    const n = typeof graduationYear === 'number' ? graduationYear : Number(graduationYear);
    if (!Number.isInteger(n) || n < 2000 || n > 2100) {
      return NextResponse.json(
        { error: 'Graduation year must be a 4-digit year between 2000 and 2100.' },
        { status: 400 },
      );
    }
    normalizedGradYear = n;
  }

  if (!HANDLE_REGEX.test(normalizedHandle)) {
    return NextResponse.json(
      { error: 'Handle must be 3–32 characters using lowercase letters, numbers, hyphen, or underscore.' },
      { status: 400 },
    );
  }

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Reject taken handles upfront so the user sees the error here, not after
  // clicking the magic link.
  const { data: existingHandle } = await db
    .from('player_profiles')
    .select('user_id')
    .ilike('handle', normalizedHandle)
    .maybeSingle();
  if (existingHandle) {
    return NextResponse.json({ error: 'That handle is already taken.' }, { status: 409 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL;
  if (!appUrl) {
    console.error('[player-signup] NEXT_PUBLIC_APP_URL / APP_URL is not set');
    return NextResponse.json({ error: 'Server configuration error.' }, { status: 500 });
  }

  const redirectTo = `${appUrl}/auth/callback?intent=player&next=/players/me`;

  const metadata: Record<string, unknown> = {
    intent: 'player',
    player_handle: normalizedHandle,
    first_name: normalizedFirstName,
    last_name: normalizedLastName,
  };
  if (normalizedGradYear !== undefined) metadata.graduation_year = normalizedGradYear;

  const { error: otpError } = await db.auth.signInWithOtp({
    email: normalizedEmail,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: redirectTo,
      data: metadata,
    },
  });

  if (otpError) {
    const isRateLimit = otpError.message?.toLowerCase().includes('security purposes');
    console.error('[player-signup] signInWithOtp failed:', otpError.message);
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
