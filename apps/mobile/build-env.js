/**
 * Build-time guard for the env vars the app cannot start without.
 *
 * Expo inlines `EXPO_PUBLIC_*` values into the JS bundle when it is built, so
 * a build made without them still succeeds — and then every launch dies with
 * "supabaseUrl is required" before the first screen (TestFlight build 4).
 * Failing the build is far cheaper than shipping that.
 *
 * Only EAS builds are checked (`EAS_BUILD=true` on the build worker): local
 * `expo start` / Xcode runs read `.env.local`, and a developer without one
 * should still be able to evaluate the config.
 */

const REQUIRED_BUILD_ENV = ['EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_ANON_KEY'];

function assertBuildEnv(env) {
  if (env.EAS_BUILD !== 'true') return;

  const missing = REQUIRED_BUILD_ENV.filter((name) => !String(env[name] ?? '').trim());
  if (missing.length === 0) return;

  throw new Error(
    `EAS build is missing required environment variables: ${missing.join(', ')}.\n` +
      'The app would crash on launch ("supabaseUrl is required"). Add them to this ' +
      "build profile's EAS environment (expo.dev → Project → Environment variables, " +
      'or `eas env:create`) and rebuild.',
  );
}

module.exports = { REQUIRED_BUILD_ENV, assertBuildEnv };
