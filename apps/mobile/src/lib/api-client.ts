import type { ZodType, ZodTypeDef } from 'zod';
import { getSupabaseClient } from './supabase';

/**
 * Typed client for the web app's mobile API (`/api/m/v1/*`).
 *
 * The data-access rule: anything web does through the user session (RLS)
 * mobile reads and writes directly via Supabase; anything web does with the
 * service role, admin auth, AI, or multi-step writes goes through one of
 * these routes, so each action has exactly one authorization implementation.
 *
 * Every request carries the Supabase access token as a bearer token. Every
 * failure — including no network — surfaces as an `ApiError` with a `kind`
 * screens can branch on, never a raw fetch rejection.
 */

export const MOBILE_API_PREFIX = '/api/m/v1';
const DEFAULT_TIMEOUT_MS = 15_000;

export type ApiErrorKind =
  /** The request never reached the server (no network, DNS, TLS). */
  | 'offline'
  | 'timeout'
  /** No session, or the server rejected the token (401). */
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  /** The server rejected the input (400 / 422). */
  | 'invalid'
  | 'conflict'
  | 'server'
  /** `EXPO_PUBLIC_API_BASE_URL` is not set in this build. */
  | 'not_configured'
  /** A 2xx whose body didn't match the expected schema. */
  | 'bad_response';

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status?: number;
  /** The server's machine-readable `code`, when it sent one. */
  readonly code?: string;

  constructor(kind: ApiErrorKind, message: string, options: { status?: number; code?: string } = {}) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = options.status;
    this.code = options.code;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/** Failures a retry can't fix — React Query should not retry these. */
export function isPermanentApiError(error: unknown): boolean {
  return isApiError(error)
    && ['unauthenticated', 'forbidden', 'not_found', 'invalid', 'conflict', 'not_configured', 'bad_response']
      .includes(error.kind);
}

/** A short message suitable for an error state on screen. */
export function describeApiError(error: unknown): string {
  if (!isApiError(error)) return 'Something went wrong. Please try again.';
  switch (error.kind) {
    case 'offline':
      return "You're offline. Connect to the internet and try again.";
    case 'timeout':
      return 'The server took too long to respond. Please try again.';
    case 'unauthenticated':
      return 'Your session has expired. Please sign in again.';
    case 'forbidden':
      return error.message || "You don't have permission to do that.";
    case 'not_found':
      return error.message || 'Not found.';
    case 'invalid':
    case 'conflict':
      return error.message;
    default:
      return 'Something went wrong. Please try again.';
  }
}

export function kindForStatus(status: number): ApiErrorKind {
  if (status === 401) return 'unauthenticated';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 409) return 'conflict';
  if (status === 400 || status === 422) return 'invalid';
  return 'server';
}

type Schema<T> = ZodType<T, ZodTypeDef, unknown>;

export interface ApiClientConfig {
  baseUrl: string | undefined;
  getAccessToken: () => Promise<string | null>;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export interface RequestOptions<T> {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  /** Validates (and types) the response body. */
  schema?: Schema<T>;
  signal?: AbortSignal;
}

export function createApiClient(config: ApiClientConfig) {
  const fetchImpl = config.fetchImpl ?? fetch;
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  async function request<T = unknown>(path: string, options: RequestOptions<T> = {}): Promise<T> {
    const baseUrl = config.baseUrl?.trim().replace(/\/+$/, '');
    if (!baseUrl) {
      throw new ApiError('not_configured', 'EXPO_PUBLIC_API_BASE_URL is not set');
    }

    const token = await config.getAccessToken();
    if (!token) throw new ApiError('unauthenticated', 'Not signed in');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const onCallerAbort = () => controller.abort();
    options.signal?.addEventListener('abort', onCallerAbort);

    const method = options.method ?? 'GET';
    const cleanUp = () => {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onCallerAbort);
    };
    const abortError = (err: unknown): unknown => {
      if (controller.signal.aborted && !options.signal?.aborted) {
        return new ApiError('timeout', `${method} ${path} timed out after ${timeoutMs}ms`);
      }
      if (options.signal?.aborted) return err;
      return new ApiError('offline', `${method} ${path} failed: ${err instanceof Error ? err.message : String(err)}`);
    };

    // The timeout covers the body as well as the headers: fetch resolves on
    // headers, and a stalled body read would otherwise never settle.
    let response: Response;
    let body: unknown;
    try {
      response = await fetchImpl(`${baseUrl}${MOBILE_API_PREFIX}${path}`, {
        method,
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
          ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });
      body = await response.json().catch((err: unknown) => {
        // An unparseable body is just absent; an aborted read is a failure.
        if (controller.signal.aborted) throw err;
        return undefined;
      });
    } catch (err) {
      throw abortError(err);
    } finally {
      cleanUp();
    }

    if (!response.ok) {
      const errorBody = (body ?? {}) as { error?: unknown; code?: unknown };
      throw new ApiError(
        kindForStatus(response.status),
        typeof errorBody.error === 'string' ? errorBody.error : `${method} ${path} failed (${response.status})`,
        { status: response.status, code: typeof errorBody.code === 'string' ? errorBody.code : undefined },
      );
    }

    if (!options.schema) return body as T;
    const parsed = options.schema.safeParse(body);
    if (!parsed.success) {
      console.warn(`api-client: ${method} ${path} response did not match schema`, parsed.error.issues);
      throw new ApiError('bad_response', `${method} ${path} returned an unexpected response`, {
        status: response.status,
      });
    }
    return parsed.data;
  }

  return {
    request,
    get: <T>(path: string, schema?: Schema<T>, signal?: AbortSignal) =>
      request<T>(path, { schema, signal }),
    post: <T>(path: string, body: unknown, schema?: Schema<T>) =>
      request<T>(path, { method: 'POST', body, schema }),
    patch: <T>(path: string, body: unknown, schema?: Schema<T>) =>
      request<T>(path, { method: 'PATCH', body, schema }),
    put: <T>(path: string, body: unknown, schema?: Schema<T>) =>
      request<T>(path, { method: 'PUT', body, schema }),
    delete: <T>(path: string, schema?: Schema<T>) =>
      request<T>(path, { method: 'DELETE', schema }),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

/** The app's client: bearer token from the current Supabase session. */
export const apiClient: ApiClient = createApiClient({
  baseUrl: process.env.EXPO_PUBLIC_API_BASE_URL,
  getAccessToken: async () => {
    const { data } = await getSupabaseClient().auth.getSession();
    return data.session?.access_token ?? null;
  },
});
