'use client';

import type { JSX } from 'react';
import { useEffect, useRef } from 'react';

/**
 * Hash-fragment bridge for the implicit auth flow.
 *
 * Supabase's default email template routes through /auth/v1/verify and
 * 302s back to us with #access_token=... in the hash. Hash fragments are
 * never sent to the server, so we have to process them client-side and
 * hand the tokens to /api/auth/set-session, which writes the session
 * cookies atomically on its response — avoiding the race condition that
 * happens if we let the browser Supabase SDK fire SIGNED_IN on its own.
 */
function HashBridge(): JSX.Element {
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    async function run() {
      const hash = window.location.hash.startsWith('#')
        ? window.location.hash.slice(1)
        : window.location.hash;
      const hashParams = new URLSearchParams(hash);
      const accessToken = hashParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token');

      const search = new URLSearchParams(window.location.search);
      const nextParam = search.get('next');
      const next =
        nextParam && nextParam.startsWith('/') && !nextParam.startsWith('//')
          ? nextParam
          : '/dashboard';

      if (!accessToken || !refreshToken) {
        window.location.replace('/login?error=auth_failed');
        return;
      }

      try {
        const res = await fetch('/api/auth/set-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            access_token: accessToken,
            refresh_token: refreshToken,
            team: search.get('team'),
            role: search.get('role'),
            player: search.get('player'),
            players: search.get('players'),
          }),
        });

        if (!res.ok) {
          console.error('[auth/callback/hash] set-session failed:', res.status);
          window.location.replace('/login?error=auth_failed');
          return;
        }

        window.location.replace(next);
      } catch (err) {
        console.error('[auth/callback/hash] unexpected error:', err);
        window.location.replace('/login?error=auth_failed');
      }
    }

    run();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-gray-400 text-sm">Signing you in…</p>
    </div>
  );
}

export default function HashBridgePage(): JSX.Element {
  return <HashBridge />;
}
