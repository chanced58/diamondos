export const REQUIRED_ENV = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'NEXT_PUBLIC_APP_URL',
  'CRON_SECRET',
  'INTERNAL_JOB_SECRET',
] as const;

export const RECOMMENDED_ENV = [
  'RESEND_API_KEY',
  'ANTHROPIC_API_KEY',
  'GOOGLE_MAPS_SERVER_API_KEY',
  'NEXT_PUBLIC_GOOGLE_MAPS_API_KEY',
  'ICS_FEED_SECRET',
  'ICS_FEED_BASE_URL',
] as const;

/** Names in `names` that are unset or empty. `APP_URL` also satisfies `NEXT_PUBLIC_APP_URL`. */
export function findMissingEnv(
  env: Record<string, string | undefined>,
  names: readonly string[],
): string[] {
  return names.filter((name) => {
    if (env[name]) return false;
    return !(name === 'NEXT_PUBLIC_APP_URL' && env.APP_URL);
  });
}
