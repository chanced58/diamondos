import type { SupabaseClient } from '@supabase/supabase-js';
import {
  CLIENT_ERROR_MAX_AGE_MS,
  ERROR_MESSAGE_MAX,
  clientErrorBatchSchema,
  sanitizeErrorDetails,
  type ClientErrorEntry,
} from '@baseball/shared';
import { invalidInput, serviceError, serviceOk, type ServiceResult } from '../result';
import type { AppErrorLogInsert } from '@/lib/errors/report-error';

const APP_VERSION_MAX = 32;
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;

function isWithinAcceptedWindow(occurredAt: string, now: number): boolean {
  const time = Date.parse(occurredAt);
  return time >= now - CLIENT_ERROR_MAX_AGE_MS && time <= now + MAX_FUTURE_SKEW_MS;
}

function toRow(
  entry: ClientErrorEntry,
  actorUserId: string,
  source: 'mobile' | 'web_client',
  appVersionHeader: string | null | undefined,
): AppErrorLogInsert {
  return {
    source,
    area: entry.area,
    message: entry.message.slice(0, ERROR_MESSAGE_MAX),
    details: sanitizeErrorDetails(entry.details) as AppErrorLogInsert['details'],
    user_id: actorUserId,
    team_id: entry.teamId ?? null,
    game_id: entry.gameId ?? null,
    device_id: entry.deviceId ?? null,
    app_version: entry.appVersion ?? appVersionHeader?.slice(0, APP_VERSION_MAX) ?? null,
    occurred_at: entry.occurredAt,
  };
}

/**
 * Records a batch of errors reported by a client. Does not call `reportError`
 * on failure: that would write to the same table that just failed.
 */
export async function recordClientErrors(
  db: SupabaseClient,
  actorUserId: string,
  input: unknown,
  source: 'mobile' | 'web_client',
  appVersionHeader?: string | null,
): Promise<ServiceResult<{ recorded: number }>> {
  const parsed = clientErrorBatchSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);

  const now = Date.now();
  const rows = parsed.data.entries
    .filter((entry) => isWithinAcceptedWindow(entry.occurredAt, now))
    .map((entry) => toRow(entry, actorUserId, source, appVersionHeader));
  if (rows.length === 0) return serviceOk({ recorded: 0 });

  const { error } = await db.from('app_error_log').insert(rows);
  if (error) {
    console.error(`[error] area=client-errors could not record ${rows.length} entries for user ${actorUserId}: ${error.message}`);
    return serviceError('failed', error.message);
  }
  return serviceOk({ recorded: rows.length });
}
