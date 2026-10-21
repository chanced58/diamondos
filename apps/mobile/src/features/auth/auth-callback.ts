/**
 * `baseballcoaches://auth-callback` — where magic links and Google sign-in
 * return to the app. With the PKCE flow the URL carries `?code=…` to exchange
 * for a session; failures come back as `error` / `error_code` /
 * `error_description`, in the query or (for some Supabase errors) the
 * fragment.
 */

export const AUTH_CALLBACK_URL = 'baseballcoaches://auth-callback';

export const GOOGLE_NOT_INVITED_MESSAGE =
  "That Google account isn't associated with an invite. Contact your coach, or sign in with the email your invite was sent to.";

export type AuthCallbackResult =
  | { kind: 'code'; code: string }
  | { kind: 'error'; message: string }
  | { kind: 'empty' };

function readParams(url: string): URLSearchParams {
  const params = new URLSearchParams();
  const hashIndex = url.indexOf('#');
  const queryIndex = url.indexOf('?');
  const query = queryIndex >= 0 ? url.slice(queryIndex + 1, hashIndex > queryIndex ? hashIndex : undefined) : '';
  const fragment = hashIndex >= 0 ? url.slice(hashIndex + 1) : '';
  for (const part of [query, fragment]) {
    new URLSearchParams(part).forEach((value, key) => {
      if (!params.has(key)) params.set(key, value);
    });
  }
  return params;
}

/** Turns a Supabase error code into something a coach or parent can act on. */
export function describeAuthCallbackError(error: string, errorCode?: string | null, description?: string | null): string {
  if (error === 'server_error') return GOOGLE_NOT_INVITED_MESSAGE;
  if (errorCode === 'otp_expired') {
    return 'That sign-in link has expired or was already used. Request a new one, or enter the code from the email.';
  }
  return description || 'Sign-in failed. Please try again.';
}

export function parseAuthCallbackUrl(url: string | null | undefined): AuthCallbackResult {
  if (!url) return { kind: 'empty' };
  const params = readParams(url);
  const error = params.get('error');
  if (error) {
    return {
      kind: 'error',
      message: describeAuthCallbackError(error, params.get('error_code'), params.get('error_description')),
    };
  }
  const code = params.get('code');
  return code ? { kind: 'code', code } : { kind: 'empty' };
}

/** The exchange fails without the PKCE verifier saved when the link was requested. */
export function describeExchangeError(message: string): string {
  if (/code verifier|flow state/i.test(message)) {
    return 'Open the sign-in link on the device where you requested it, or enter the code from the email instead.';
  }
  return message;
}
