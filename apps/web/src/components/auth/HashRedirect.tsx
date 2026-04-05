'use client';

import { useEffect } from 'react';

/**
 * Safety net: if the user lands on any page with a hash fragment containing
 * an access_token (Supabase implicit flow), redirect to /callback so the
 * client-side callback handler can process it.
 *
 * This handles the case where the Supabase email template sends users to
 * the site root with #access_token=... instead of /auth/callback?token_hash=...
 */
export function HashRedirect() {
  useEffect(() => {
    if (window.location.hash?.includes('access_token=')) {
      window.location.href = `/callback${window.location.hash}`;
    }
  }, []);

  return null;
}
