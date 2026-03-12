'use client';

import type { JSX } from 'react';
import { Suspense, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { createBrowserClient } from '@/lib/supabase/client';

/**
 * Client-side callback fallback for magic-link authentication.
 *
 * The primary callback is the server-side route handler at /auth/callback.
 * This page handles backwards-compatible links that still point to /callback,
 * as well as hash-fragment tokens from the implicit flow (which can only be
 * processed client-side since hash fragments are not sent to the server).
 */
function CallbackHandler(): JSX.Element {
  const searchParams = useSearchParams();
  const processed = useRef(false);

  useEffect(() => {
    if (processed.current) return;
    processed.current = true;

    async function handleCallback() {
      const code = searchParams.get('code');
      const tokenHash = searchParams.get('token_hash');
      const type = searchParams.get('type');

      // If we have query-string params (code or token_hash), delegate to
      // the server-side handler which sets cookies atomically on the redirect.
      if (code || (tokenHash && type)) {
        const params = new URLSearchParams(window.location.search);
        window.location.href = `/auth/callback?${params.toString()}`;
        return;
      }

      // Hash-fragment tokens (implicit flow) can only be processed client-side.
      if (window.location.hash) {
        const supabase = createBrowserClient();
        const session = await new Promise<boolean>((resolve) => {
          const {
            data: { subscription },
          } = supabase.auth.onAuthStateChange((event) => {
            if (event === 'SIGNED_IN') {
              subscription.unsubscribe();
              resolve(true);
            }
          });
          setTimeout(() => {
            subscription.unsubscribe();
            resolve(false);
          }, 5000);
        });

        if (session) {
          window.location.href = '/dashboard';
          return;
        }
      }

      // Nothing we can process — send back to login
      window.location.href = '/login?error=auth_failed';
    }

    handleCallback();
  }, [searchParams]);

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
