import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types/supabase';

// Use broad schema generics so both @supabase/supabase-js and @supabase/ssr clients are assignable
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TypedSupabaseClient = SupabaseClient<Database, any, any>;

/**
 * Creates a Supabase client for use in browser / React Native contexts.
 * Uses the anon key and respects RLS.
 */
export function createBrowserClient(): TypedSupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      'Missing Supabase environment variables. ' +
        'Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (or EXPO_PUBLIC_ variants).',
    );
  }

  return createClient<Database>(url, key);
}

/**
 * Creates a Supabase service-role client for use ONLY in edge functions
 * or server-side code where you need to bypass RLS.
 * NEVER use this client in browser or React Native code.
 */
export function createServiceRoleClient(): TypedSupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      'Missing Supabase service role environment variables. ' +
        'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.',
    );
  }

  return createClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
