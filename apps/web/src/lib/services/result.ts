import type { ZodError } from 'zod';

/**
 * What every service in `lib/services/` returns.
 *
 * Services are the single implementation of an action shared by a web server
 * action (cookie user) and a mobile `/api/m/v1` route (bearer user):
 *
 *   (db: service-role client, actorUserId, input: unknown) → ServiceResult
 *
 * They validate `input` with the shared zod schema, authorize the actor, and
 * never throw for expected failures — the caller maps `code` to a form
 * message (web) or an HTTP status (mobile, see `lib/api/service-response`).
 */
export type ServiceErrorCode = 'invalid' | 'forbidden' | 'not_found' | 'conflict' | 'failed';

export type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: ServiceErrorCode; error: string };

export function serviceOk<T>(data: T): ServiceResult<T> {
  return { ok: true, data };
}

export function serviceError<T = never>(code: ServiceErrorCode, error: string): ServiceResult<T> {
  return { ok: false, code, error };
}

/** The first validation issue as a user-facing message. */
export function invalidInput<T = never>(error: ZodError): ServiceResult<T> {
  return serviceError('invalid', error.issues[0]?.message ?? 'Invalid input.');
}
