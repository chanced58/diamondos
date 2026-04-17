'use client';

import type { JSX } from 'react';
import { useEffect } from 'react';

/**
 * Backwards-compat shim for bookmarked /callback links.
 * Forwards to the canonical handlers under /auth/callback.
 */
export default function LegacyCallbackPage(): JSX.Element {
  useEffect(() => {
    const search = window.location.search;
    const hash = window.location.hash;
    const target = hash.includes('access_token=')
      ? `/auth/callback/hash${search}${hash}`
      : `/auth/callback${search}`;
    window.location.replace(target);
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-gray-400 text-sm">Signing you in…</p>
    </div>
  );
}
