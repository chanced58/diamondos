'use client';

import { createBrowserClient as createSupabaseBrowserClient } from '@supabase/ssr';
import type { Database, TypedSupabaseClient } from '@baseball/database';

let client: TypedSupabaseClient | undefined;

/**
 * Returns a singleton Supabase browser client for use in Client Components.
 * Uses the @supabase/ssr browser client which integrates with Next.js cookies.
 */
export function createBrowserClient(): TypedSupabaseClient {
  if (!client) {
    client = createSupabaseBrowserClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    ) as unknown as TypedSupabaseClient;
  }
  return client;
}
