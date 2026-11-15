/**
 * Internal-caller authorization for edge functions that must never be reached
 * with the public anon key (push-notifications, practice-notifications-dispatch,
 * pitch-count-calculator). A caller is internal when it sends
 * `x-internal-secret` equal to `INTERNAL_JOB_SECRET` (the database via pg_net,
 * other functions) or a bearer token equal to this project's service-role key
 * (the web's service-role client, function-to-function invokes).
 */
import { corsHeaders } from './cors.ts';

export const INTERNAL_SECRET_HEADER = 'x-internal-secret';

export interface InternalAuthEnv {
  internalSecret?: string;
  serviceRoleKey?: string;
}

const encoder = new TextEncoder();

/**
 * Constant-time comparison over UTF-8 bytes for equal-length inputs. A length
 * mismatch returns early, so timing reveals only the length — acceptable for
 * random secrets and keys.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);
  if (aBytes.length !== bBytes.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < aBytes.length; i++) diff |= aBytes[i] ^ bBytes[i];
  return diff === 0;
}

function bearerToken(headers: Headers): string | null {
  const authorization = headers.get('authorization');
  if (!authorization) return null;
  const match = /^Bearer\s+(.*)$/i.exec(authorization.trim());
  return match ? match[1].trim() : null;
}

/** Pure check: does this request come from an internal caller? */
export function isInternalRequest(headers: Headers, env: InternalAuthEnv): boolean {
  const providedSecret = headers.get(INTERNAL_SECRET_HEADER);
  if (env.internalSecret && providedSecret && timingSafeEqual(providedSecret, env.internalSecret)) {
    return true;
  }
  const token = bearerToken(headers);
  if (env.serviceRoleKey && token && timingSafeEqual(token, env.serviceRoleKey)) {
    return true;
  }
  return false;
}

/** Returns a 401 response for a non-internal caller, or null to continue. */
export function requireInternal(req: Request): Response | null {
  const allowed = isInternalRequest(req.headers, {
    internalSecret: Deno.env.get('INTERNAL_JOB_SECRET'),
    serviceRoleKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
  });
  if (allowed) return null;
  return new Response(JSON.stringify({ error: 'unauthorized' }), {
    status: 401,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** Headers for a function-to-function invoke; empty when the secret is unset. */
export function internalHeaders(): Record<string, string> {
  const secret = Deno.env.get('INTERNAL_JOB_SECRET');
  return secret ? { [INTERNAL_SECRET_HEADER]: secret } : {};
}
