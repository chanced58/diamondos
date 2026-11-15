import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@baseball/database';
import { errorMessageOf, sanitizeErrorDetails } from '@baseball/shared';

export type AppErrorLogInsert = Database['public']['Tables']['app_error_log']['Insert'];

export type ErrorSource = 'web' | 'web_client' | 'mobile' | 'edge' | 'db';

export interface ErrorContext {
  userId?: string;
  teamId?: string;
  gameId?: string;
  details?: Record<string, unknown>;
}

export function buildErrorRow(
  source: ErrorSource,
  area: string,
  error: unknown,
  context: ErrorContext = {},
): AppErrorLogInsert {
  return {
    source,
    area,
    message: errorMessageOf(error),
    details: sanitizeErrorDetails(context.details) as AppErrorLogInsert['details'],
    user_id: context.userId ?? null,
    team_id: context.teamId ?? null,
    game_id: context.gameId ?? null,
  };
}

let cachedClient: SupabaseClient | null = null;

function getServiceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  cachedClient ??= createClient(url, serviceRoleKey);
  return cachedClient;
}

function logToConsole(row: AppErrorLogInsert): void {
  try {
    const context = JSON.stringify({
      userId: row.user_id,
      teamId: row.team_id,
      gameId: row.game_id,
      details: row.details,
    });
    console.error(`[error] area=${row.area} ${row.message} ${context}`);
  } catch {
    // A logging failure must never stop the insert.
  }
}

/** Logs the error and records it in app_error_log. Never throws; the insert is fire-and-forget. */
export function reportError(area: string, error: unknown, context?: ErrorContext): void {
  try {
    const row = buildErrorRow('web', area, error, context);
    logToConsole(row);

    const db = getServiceClient();
    if (!db) {
      console.error(`[error] area=${area} could not record error: Supabase service role env is missing`);
      return;
    }
    void Promise.resolve(db.from('app_error_log').insert(row))
      .then((result) => {
        if (result?.error) console.error(`[error] area=${area} could not record error: ${result.error.message}`);
      })
      .catch((insertError: unknown) => {
        console.error(`[error] area=${area} could not record error: ${errorMessageOf(insertError)}`);
      });
  } catch (reportFailure) {
    console.error(`[error] area=${area} reportError failed: ${errorMessageOf(reportFailure)}`);
  }
}
