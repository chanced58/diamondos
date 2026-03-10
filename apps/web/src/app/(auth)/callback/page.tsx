'use client';

import type { JSX } from 'react';
import { Suspense, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createBrowserClient } from '@/lib/supabase/client';

/**
 * Client-side callback page for magic-link authentication.
 *
 * The code exchange happens browser-side so that the PKCE code_verifier
 * cookie (set when signInWithOtp was called) is available. A server-side
 * route handler cannot reliably access this cookie.
 *
 * After establishing a session, any invite params are forwarded to a
 * server-side API endpoint for processing (team_members, invitations, etc.).
 */
function CallbackHandler(): JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();
  const processed = useRef(false);

  useEffect(() => {
    // Prevent double-processing in React StrictMode
    if (processed.current) return;
    processed.current = true;

    async function handleCallback() {
      const code = searchParams.get('code');
      const teamId = searchParams.get('team');
      const role = searchParams.get('role');
      const playerId = searchParams.get('player');
      const playersParam = searchParams.get('players');
      const redirectTo = searchParams.get('redirectTo') ?? '/dashboard';

      if (!code) {
        console.error('[callback] No code parameter in URL');
        router.replace('/login?error=auth_failed');
        return;
      }

      // Exchange the PKCE code for a session using the browser client
      // (which has the code_verifier cookie stored from signInWithOtp)
      const supabase = createBrowserClient();
      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

      if (exchangeError) {
        console.error('[callback] Code exchange failed:', exchangeError.message);
        router.replace('/login?error=auth_failed');
        return;
      }

      // Process invite if applicable (server-side, using service role)
      if (teamId && role) {
        try {
          await fetch('/api/auth/process-invite', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ teamId, role, playerId, playersParam }),
          });
        } catch (err) {
          console.error('[callback] Invite processing failed:', err);
          // Continue to redirect — the layout auto-accept logic will retry
        }
      }

      router.replace(redirectTo);
    }

    handleCallback();
  }, [searchParams, router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-gray-400 text-sm">Signing you in…</p>
    </div>
  );
}

export default function CallbackPage(): JSX.Element {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <p className="text-gray-400 text-sm">Loading…</p>
        </div>
      }
    >
      <CallbackHandler />
    </Suspense>
  );
}
