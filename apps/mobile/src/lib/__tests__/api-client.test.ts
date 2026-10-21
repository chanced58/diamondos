import { z } from 'zod';
import { ApiError, createApiClient, describeApiError, isPermanentApiError } from '../api-client';

jest.mock('../supabase', () => ({ getSupabaseClient: jest.fn() }));

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

function client(fetchImpl: jest.Mock, overrides: Partial<Parameters<typeof createApiClient>[0]> = {}) {
  return createApiClient({
    baseUrl: 'https://app.example.com/',
    getAccessToken: async () => 'token-1',
    fetchImpl: fetchImpl as unknown as typeof fetch,
    ...overrides,
  });
}

async function caught(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (err) {
    return err as ApiError;
  }
  throw new Error('expected the request to fail');
}

describe('api-client', () => {
  it('should send the bearer token to the versioned path and parse with the schema', async () => {
    const fetchImpl = jest.fn(async () => jsonResponse(200, { id: 'u1', extra: true }));

    const result = await client(fetchImpl).get('/me', z.object({ id: z.string() }));

    expect(result).toEqual({ id: 'u1' });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://app.example.com/api/m/v1/me',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ Authorization: 'Bearer token-1' }),
      }),
    );
  });

  it('should JSON-encode a POST body', async () => {
    const fetchImpl = jest.fn(async () => jsonResponse(201, { eventId: 'e1' }));

    await client(fetchImpl).post('/team-events', { title: 'Meeting' });

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://app.example.com/api/m/v1/team-events',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ title: 'Meeting' }),
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      }),
    );
  });

  it.each([
    [401, 'unauthenticated'],
    [403, 'forbidden'],
    [404, 'not_found'],
    [400, 'invalid'],
    [409, 'conflict'],
    [500, 'server'],
    [503, 'server'],
  ])('should map HTTP %i to a %s error carrying the server message', async (status, kind) => {
    const fetchImpl = jest.fn(async () => jsonResponse(status, { error: 'Nope', code: 'some_code' }));

    const error = await caught(client(fetchImpl).get('/me'));

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ kind, status, code: 'some_code', message: 'Nope' });
  });

  it('should report a thrown fetch as offline', async () => {
    const fetchImpl = jest.fn(async () => {
      throw new TypeError('Network request failed');
    });

    expect((await caught(client(fetchImpl).get('/me'))).kind).toBe('offline');
  });

  it('should time out a request that never answers', async () => {
    const fetchImpl = jest.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new Error('Aborted')));
        }),
    );

    const error = await caught(client(fetchImpl, { timeoutMs: 5 }).get('/me'));

    expect(error.kind).toBe('timeout');
  });

  it('should fail fast without a base URL or a session', async () => {
    const fetchImpl = jest.fn();

    expect((await caught(client(fetchImpl, { baseUrl: undefined }).get('/me'))).kind).toBe('not_configured');
    expect((await caught(client(fetchImpl, { getAccessToken: async () => null }).get('/me'))).kind)
      .toBe('unauthenticated');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('should reject a 2xx body that does not match the schema', async () => {
    const fetchImpl = jest.fn(async () => jsonResponse(200, { id: 42 }));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const error = await caught(client(fetchImpl).get('/me', z.object({ id: z.string() })));

    expect(error.kind).toBe('bad_response');
    warn.mockRestore();
  });
});

describe('isPermanentApiError / describeApiError', () => {
  it('should treat auth and input failures as permanent and network failures as retryable', () => {
    expect(isPermanentApiError(new ApiError('forbidden', 'x'))).toBe(true);
    expect(isPermanentApiError(new ApiError('offline', 'x'))).toBe(false);
    expect(isPermanentApiError(new ApiError('server', 'x'))).toBe(false);
    expect(isPermanentApiError(new Error('x'))).toBe(false);
  });

  it('should explain offline without leaking internal detail for server errors', () => {
    expect(describeApiError(new ApiError('offline', 'GET /me failed: Network request failed')))
      .toMatch(/offline/i);
    expect(describeApiError(new ApiError('server', 'stack trace'))).toBe('Something went wrong. Please try again.');
    expect(describeApiError(new ApiError('invalid', 'Event title is required.'))).toBe('Event title is required.');
  });
});
