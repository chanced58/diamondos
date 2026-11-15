import { reportError } from '@/lib/errors/report-error';

/**
 * Resolves the canonical app origin from env vars, defensively normalized.
 *
 * Strips trailing slashes and any accidental `/auth/callback` suffix so a
 * misconfigured `NEXT_PUBLIC_APP_URL` (e.g. `https://www.diamondos.app/auth/callback`)
 * cannot cause callers that append `/auth/callback` themselves to produce
 * a doubled `/auth/callback/auth/callback` redirect URL — a real production
 * bug we hit because the env var on Render had the path baked into it.
 *
 * Returns the empty string if no source URL is available; callers that need
 * a hard requirement should check for that and surface a config error.
 */
export function getAppOrigin(fallback?: string): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? fallback ?? '';
  return raw.replace(/\/+$/, '').replace(/\/auth\/callback$/, '');
}

const DEV_APP_ORIGIN = 'http://localhost:3001';

/**
 * The origin to put in emailed links. `getAppOrigin()` when configured;
 * localhost outside production; otherwise null (after reporting), so callers
 * refuse to send a link to an address nobody configured.
 */
export function resolveAppOrigin(): string | null {
  const configured = getAppOrigin();
  if (configured) return configured;
  if (process.env.NODE_ENV !== 'production') return DEV_APP_ORIGIN;
  reportError('config', 'NEXT_PUBLIC_APP_URL is not set');
  return null;
}
