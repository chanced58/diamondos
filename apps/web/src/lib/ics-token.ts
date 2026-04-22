/**
 * Server-side HMAC signer for ICS feed URLs.
 *
 * Mirrors the algorithm in supabase/functions/_shared/hmac.ts. The two
 * implementations MUST produce identical output for the same (teamId,
 * version, secret) — the edge function verifies what this file signs.
 *
 * Uses WebCrypto (available in Node 18+), not node:crypto, so the algorithm
 * is literally line-for-line equivalent to the Deno side.
 */
import 'server-only';

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return Buffer.from(binary, 'binary')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function hmacSha256(secret: string, payload: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(payload),
  );
  return new Uint8Array(signature);
}

function getSecret(): string {
  const s = process.env.ICS_FEED_SECRET;
  if (!s || s.length < 32) {
    throw new Error(
      'ICS_FEED_SECRET is not configured (must be ≥ 32 chars). Add it to your environment.',
    );
  }
  return s;
}

export async function signIcsToken(teamId: string, version: number): Promise<string> {
  const digest = await hmacSha256(getSecret(), `${teamId}:${version}`);
  return base64UrlEncode(digest);
}

/**
 * Build the full subscribable ICS URL for a team. The base URL points at the
 * Supabase edge function endpoint. We prefer an explicit `ICS_FEED_BASE_URL`
 * env var (useful in local dev) and fall back to deriving from
 * `NEXT_PUBLIC_SUPABASE_URL`.
 */
export function icsFeedBaseUrl(): string {
  const explicit = process.env.ICS_FEED_BASE_URL;
  if (explicit) return explicit.replace(/\/$/, '');
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) {
    throw new Error('Neither ICS_FEED_BASE_URL nor NEXT_PUBLIC_SUPABASE_URL is set');
  }
  return `${supabaseUrl.replace(/\/$/, '')}/functions/v1/team-calendar-ics`;
}

export async function buildIcsFeedUrl(teamId: string, version: number): Promise<string> {
  const token = await signIcsToken(teamId, version);
  const base = icsFeedBaseUrl();
  return `${base}?team=${encodeURIComponent(teamId)}&token=${token}`;
}
