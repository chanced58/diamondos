import {
  GOOGLE_NOT_INVITED_MESSAGE,
  describeExchangeError,
  parseAuthCallbackUrl,
} from '../auth-callback';

describe('parseAuthCallbackUrl', () => {
  it('should read the PKCE code from a magic link', () => {
    expect(parseAuthCallbackUrl('baseballcoaches://auth-callback?code=abc-123'))
      .toEqual({ kind: 'code', code: 'abc-123' });
  });

  it('should report an expired link from the fragment', () => {
    const result = parseAuthCallbackUrl(
      'baseballcoaches://auth-callback#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid',
    );

    expect(result).toEqual({ kind: 'error', message: expect.stringContaining('expired') });
  });

  it('should explain the invite-only Google rejection', () => {
    expect(parseAuthCallbackUrl('baseballcoaches://auth-callback?error=server_error&error_description=Database+error'))
      .toEqual({ kind: 'error', message: GOOGLE_NOT_INVITED_MESSAGE });
  });

  it('should fall back to the description for other errors', () => {
    expect(parseAuthCallbackUrl('baseballcoaches://auth-callback?error=invalid_request&error_description=Bad+thing'))
      .toEqual({ kind: 'error', message: 'Bad thing' });
  });

  it('should be empty without a code or an error', () => {
    expect(parseAuthCallbackUrl(null)).toEqual({ kind: 'empty' });
    expect(parseAuthCallbackUrl('baseballcoaches://auth-callback')).toEqual({ kind: 'empty' });
  });
});

describe('describeExchangeError', () => {
  it('should explain a link opened on another device', () => {
    expect(describeExchangeError('invalid request: both auth code and code verifier should be non-empty'))
      .toMatch(/device where you requested it/);
    expect(describeExchangeError('something else')).toBe('something else');
  });
});
