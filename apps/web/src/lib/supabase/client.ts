'use client';

import { createBrowserClient as createSupabaseBrowserClient } from '@supabase/ssr';
import type { Database } from '@baseball/database';

let client: ReturnType<typeof createSupabaseBrowserClient<Database>> | undefined;

/**
 * Returns a singleton Supabase browser client for use in Client Components.
 * Uses the @supabase/ssr browser client which integrates with Next.js cookies.
 */
export function createBrowserClient() {
  if (!client) {
    client = createSupabaseBrowserClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
  }
  return client;
}
