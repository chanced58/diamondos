/**
 * HMAC-SHA256 helpers for signing team-scoped integration URLs (ICS feed today,
 * possibly more later). Runs on Deno via the WebCrypto API.
 *
 * Token payload:  "<team_id>:<token_version>"
 * Token encoding: base64url (no padding) of the HMAC digest.
 *
 * Rotation is done by bumping `team_integrations.config.ics_token_version`,
 * NOT by rotating `ICS_FEED_SECRET`. The secret is a permanent project-level
 * value; rotating it invalidates every team's subscribed feed URL.
 */

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmacSha256(secret: string, payload: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return new Uint8Array(signature);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function getSecret(): string {
  const s = Deno.env.get('ICS_FEED_SECRET');
  if (!s || s.length < 32) {
    throw new Error('ICS_FEED_SECRET is not configured (must be >= 32 chars)');
  }
  return s;
}

/** Sign a team-scoped ICS token. */
export async function signIcsToken(teamId: string, version: number): Promise<string> {
  const payload = `${teamId}:${version}`;
  const digest = await hmacSha256(getSecret(), payload);
  return base64UrlEncode(digest);
}

export interface IcsTokenVerification {
  valid: boolean;
  version?: number;
}

/**
 * Verify a token against a set of candidate versions (typically just the
 * current one from team_integrations.config). Constant-time comparison.
 */
export async function verifyIcsToken(
  teamId: string,
  token: string,
  candidateVersions: number[],
): Promise<IcsTokenVerification> {
  for (const version of candidateVersions) {
    const expected = await signIcsToken(teamId, version);
    if (timingSafeEqual(expected, token)) {
      return { valid: true, version };
    }
  }
  return { valid: false };
}
