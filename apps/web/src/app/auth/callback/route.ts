import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { type NextRequest, NextResponse } from 'next/server';

/**
 * Server-side auth callback route handler.
 *
 * This is the primary auth callback — Supabase redirects here after the user
 * clicks a magic link or invite email. Handles:
 *   1. PKCE code exchange (?code=xxx)
 *   2. Direct token verification (?token_hash=xxx&type=magiclink)
 *
 * Auth cookies are set atomically on the redirect response, avoiding the race
 * condition that occurs with client-side SPA navigation.
 *
 * GET /auth/callback?code=xxx[&team=...&role=...&player=...&players=...]
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as
    | 'magiclink'
    | 'email'
    | 'recovery'
    | 'signup'
    | null;

  // Invite params (forwarded from invite emails)
  const teamId = searchParams.get('team');
  const role = searchParams.get('role');
  const playerId = searchParams.get('player');
  const playersParam = searchParams.get('players');
  const next = searchParams.get('next') ?? '/dashboard';

  const redirectUrl = new URL(next, request.url);
  const errorUrl = new URL('/login?error=auth_failed', request.url);

  // Build the success response FIRST so Supabase can set cookies on it
  const response = NextResponse.redirect(redirectUrl);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: { name: string; value: string; options: CookieOptions }[],
        ) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // --- Exchange auth code / token for a session ---

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error('[auth/callback] Code exchange failed:', error.message);
      return NextResponse.redirect(errorUrl);
    }
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });
    if (error) {
      console.error('[auth/callback] Token verification failed:', error.message);
      return NextResponse.redirect(errorUrl);
    }
  } else {
    console.error('[auth/callback] No code or token_hash in URL');
    return NextResponse.redirect(errorUrl);
  }

  // --- Process invite params (if present) ---

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user && teamId && role) {
    try {
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (serviceKey) {
        const db = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          serviceKey,
        );

        // Upsert team membership
        await db
          .from('team_members')
          .upsert(
            { team_id: teamId, user_id: user.id, role, is_active: true },
            { onConflict: 'team_id,user_id' },
          );

        // Accept the invitation
        if (user.email) {
          await db
            .from('team_invitations')
            .update({
              status: 'accepted',
              accepted_at: new Date().toISOString(),
            })
            .eq('team_id', teamId)
            .eq('email', user.email.toLowerCase());

          // Backfill profile name from invitation
          const { data: invite } = await db
            .from('team_invitations')
            .select('first_name, last_name')
            .eq('team_id', teamId)
            .eq('email', user.email.toLowerCase())
            .maybeSingle();

          if (invite) {
            const { data: profile } = await db
              .from('user_profiles')
              .select('first_name, last_name, email')
              .eq('id', user.id)
              .maybeSingle();

            const updates: Record<string, string> = {};
            if (!profile?.email) updates.email = user.email;
            if (!profile?.first_name && invite.first_name)
              updates.first_name = invite.first_name;
            if (!profile?.last_name && invite.last_name)
              updates.last_name = invite.last_name;

            if (Object.keys(updates).length > 0) {
              await db.from('user_profiles').update(updates).eq('id', user.id);
            }
          }
        }

        // Player-specific: link players.user_id
        if (role === 'player' && playerId) {
          await db
            .from('players')
            .update({ user_id: user.id })
            .eq('id', playerId)
            .eq('team_id', teamId);
        }

        // Parent-specific: create parent-player links
        if (role === 'parent' && playersParam) {
          for (const pid of playersParam.split(',').filter(Boolean)) {
            await db.from('parent_player_links').upsert(
              { parent_user_id: user.id, player_id: pid },
              { onConflict: 'parent_user_id,player_id', ignoreDuplicates: true },
            );
          }
        }
      }
    } catch (err) {
      console.error('[auth/callback] Invite processing failed:', err);
      // Non-fatal — self-healing logic in app layout will retry
    }
  }

  return response;
}
