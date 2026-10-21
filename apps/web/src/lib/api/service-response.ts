import { NextResponse } from 'next/server';
import type { ServiceErrorCode, ServiceResult } from '@/lib/services/result';
import { apiError } from './bearer-auth';

const STATUS_BY_CODE: Record<ServiceErrorCode, number> = {
  invalid: 400,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  failed: 500,
};

/**
 * Turns a service result into the mobile API's JSON response. Failures keep
 * the `{ error, code }` shape of `apiError`; `failed` hides its message,
 * which can carry database detail.
 */
export function serviceResponse<T>(result: ServiceResult<T>, successStatus = 200): NextResponse {
  if (result.ok) return NextResponse.json(result.data, { status: successStatus });
  const message = result.code === 'failed' ? 'Internal error' : result.error;
  return apiError(STATUS_BY_CODE[result.code], message, result.code);
}

/** Parses a JSON request body, or returns undefined when it isn't valid JSON. */
export async function readJsonBody(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return undefined;
  }
}
