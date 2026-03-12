import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { type NextRequest, NextResponse } from 'next/server';
import { addToTeamChannels } from '@/lib/team-channels';

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
      const isPkceError = error.message?.toLowerCase().includes('code verifier');
      console.error('[auth/callback] Code exchange failed:', error.message);
      const errorParam = isPkceError ? 'link_wrong_browser' : 'auth_failed';
      return NextResponse.redirect(
        new URL(`/login?error=${errorParam}`, request.url),
      );
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

  // Fallback: read invite params from user_metadata when URL params are absent
  // (e.g., when email template uses token_hash directly without query params)
  const effectiveTeamId = teamId ?? (user?.user_metadata?.invited_to_team as string | undefined) ?? null;
  const effectiveRole = role ?? (user?.user_metadata?.invited_role as string | undefined) ?? null;
  const effectivePlayerId = playerId ?? (user?.user_metadata?.invited_player_id as string | undefined) ?? null;

  if (user && effectiveTeamId && effectiveRole) {
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
            { team_id: effectiveTeamId, user_id: user.id, role: effectiveRole, is_active: true },
            { onConflict: 'team_id,user_id' },
          );

        // Add user to all team channels (announcement, topic, etc.)
        await addToTeamChannels(db, effectiveTeamId, user.id, effectiveRole);

        // Accept the invitation
        if (user.email) {
          await db
            .from('team_invitations')
            .update({
              status: 'accepted',
              accepted_at: new Date().toISOString(),
            })
            .eq('team_id', effectiveTeamId)
            .eq('email', user.email.toLowerCase());

          // Backfill profile name from invitation
          const { data: invite } = await db
            .from('team_invitations')
            .select('first_name, last_name')
            .eq('team_id', effectiveTeamId)
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
        if (effectiveRole === 'player' && effectivePlayerId) {
          await db
            .from('players')
            .update({ user_id: user.id })
            .eq('id', effectivePlayerId)
            .eq('team_id', effectiveTeamId);
        }

        // Parent-specific: create parent-player links
        if (effectiveRole === 'parent' && playersParam) {
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
