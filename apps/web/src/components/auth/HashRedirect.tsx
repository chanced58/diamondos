'use client';

import { useEffect } from 'react';

/**
 * Safety net: if the user lands on any page with a hash fragment containing
 * an access_token (Supabase implicit flow), forward to the canonical hash
 * bridge under /auth/callback/hash, preserving both the query string and
 * the hash so invite params and tokens both reach the server exchange.
 */
export function HashRedirect() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!window.location.hash?.includes('access_token=')) return;
    const search = window.location.search;
    const hash = window.location.hash;
    window.location.replace(`/auth/callback/hash${search}${hash}`);
  }, []);

  return null;
}
