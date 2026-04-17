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
  const intent = searchParams.get('intent');
  const nextParam = searchParams.get('next') ?? '/dashboard';

  // Use the public app URL for redirects. In hosted environments like Render,
  // request.url resolves to the internal address (e.g. 0.0.0.0:PORT).
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? request.nextUrl.origin;

  // Validate next param to prevent open redirects: must be a relative path
  // starting with '/' but not '//' (protocol-relative).
  const next = (nextParam.startsWith('/') && !nextParam.startsWith('//'))
    ? nextParam
    : '/dashboard';
  const redirectUrl = new URL(next, origin);
  const errorUrl = new URL('/login?error=auth_failed', origin);

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
        new URL(`/login?error=${errorParam}`, origin),
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

        // Upsert team membership — check the error before marking accepted
        const { error: memberError } = await db
          .from('team_members')
          .upsert(
            { team_id: effectiveTeamId, user_id: user.id, role: effectiveRole, is_active: true },
            { onConflict: 'team_id,user_id' },
          );

        if (memberError) {
          console.error('[auth/callback] team_members upsert failed:', memberError.message);
          // Don't mark invitation as accepted — self-healing will retry on next roster load
        }

        // Add user to all team channels (announcement, topic, etc.)
        if (!memberError) {
          await addToTeamChannels(db, effectiveTeamId, user.id, effectiveRole);
        }

        // Accept the invitation only if team membership was created successfully
        if (!memberError && user.email) {
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

  // --- Provision Player Pro profile on first login ---
  const effectiveIntent =
    intent ?? (user?.user_metadata?.intent as string | undefined) ?? null;
  if (user && effectiveIntent === 'player') {
    try {
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (serviceKey) {
        const db = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          serviceKey,
        );

        const { data: existing } = await db
          .from('player_profiles')
          .select('user_id')
          .eq('user_id', user.id)
          .maybeSingle();

        if (!existing) {
          // Normalize to the same character set the DB CHECK enforces so the
          // insert can never trip player_profiles_handle_format, and cap at
          // 25 chars so appending a 7-char suffix stays within the 32-char max.
          const normalizeHandle = (raw: string) =>
            raw.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 25);
          const rawHandle = user.user_metadata?.player_handle as string | undefined;
          const normalized = rawHandle ? normalizeHandle(rawHandle) : '';
          // Fall back to a deterministic default when metadata is missing or
          // gets stripped down to too few chars.
          const baseHandle = normalized.length >= 3 ? normalized : `player-${user.id.slice(0, 6)}`;

          const { data: taken } = await db
            .from('player_profiles')
            .select('user_id')
            .eq('handle', baseHandle)
            .maybeSingle();

          const finalHandle = taken
            ? `${baseHandle}-${user.id.slice(0, 6)}`
            : baseHandle;

          const { error: profileErr } = await db.from('player_profiles').insert({
            user_id: user.id,
            handle: finalHandle,
            is_public: false,
          });
          if (profileErr) {
            console.error('[auth/callback] player_profiles insert failed:', profileErr.message);
          }
        }

        // Backfill user_profiles name from signup metadata
        const firstName = user.user_metadata?.first_name as string | undefined;
        const lastName = user.user_metadata?.last_name as string | undefined;
        if (firstName || lastName) {
          const { data: profile } = await db
            .from('user_profiles')
            .select('first_name, last_name')
            .eq('id', user.id)
            .maybeSingle();
          const updates: Record<string, string> = {};
          if (firstName && !profile?.first_name) updates.first_name = firstName;
          if (lastName && !profile?.last_name) updates.last_name = lastName;
          if (Object.keys(updates).length > 0) {
            await db.from('user_profiles').update(updates).eq('id', user.id);
          }
        }
      }
    } catch (err) {
      console.error('[auth/callback] Player provisioning failed:', err);
    }
  }

  return response;
}
