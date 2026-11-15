import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { invalidInput, serviceError, serviceOk, type ServiceResult } from '../result';
import { reportError, type ErrorSource } from '@/lib/errors/report-error';

const ROW_LIMIT = 200;
const AREA_SCAN_LIMIT = 2000;
const DAY_MS = 24 * 60 * 60 * 1000;

const errorLogInputSchema = z.object({
  source: z.enum(['web', 'web_client', 'mobile', 'edge', 'db']).optional(),
  area: z.string().max(64).optional(),
});

export type ErrorLogRow = {
  id: string;
  occurredAt: string;
  source: ErrorSource;
  area: string;
  message: string;
  details: unknown;
  userId: string | null;
  teamId: string | null;
  gameId: string | null;
  appVersion: string | null;
  deviceId: string | null;
};

export type JobHealth = {
  job: string;
  enabled: boolean | null;
  lastRunAt: string | null;
  lastStatus: number | null;
  lastOk: boolean | null;
  lastSuccessAt: string | null;
  calls24h: number;
  failures24h: number;
};

export type ErrorLogData = {
  rows: ErrorLogRow[];
  countLast24h: number;
  areas: string[];
  jobs: JobHealth[];
};

type JobHealthDbRow = {
  job: string;
  enabled: boolean | null;
  last_run_at: string | null;
  last_status: number | null;
  last_ok: boolean | null;
  last_success_at: string | null;
  calls_24h: number;
  failures_24h: number;
};

function toJobHealth(row: JobHealthDbRow): JobHealth {
  return {
    job: row.job,
    enabled: row.enabled,
    lastRunAt: row.last_run_at,
    lastStatus: row.last_status,
    lastOk: row.last_ok,
    lastSuccessAt: row.last_success_at,
    calls24h: row.calls_24h,
    failures24h: row.failures_24h,
  };
}

async function loadJobs(db: SupabaseClient, actorUserId: string): Promise<JobHealth[]> {
  const { data, error } = await db.rpc('admin_job_health');
  if (error) {
    reportError('admin.job-health', new Error(error.message), { userId: actorUserId });
    return [];
  }
  return ((data ?? []) as JobHealthDbRow[]).map(toJobHealth);
}

type DbRow = {
  id: string;
  occurred_at: string;
  source: ErrorSource;
  area: string;
  message: string;
  details: unknown;
  user_id: string | null;
  team_id: string | null;
  game_id: string | null;
  app_version: string | null;
  device_id: string | null;
};

function toRow(row: DbRow): ErrorLogRow {
  return {
    id: row.id,
    occurredAt: row.occurred_at,
    source: row.source,
    area: row.area,
    message: row.message,
    details: row.details,
    userId: row.user_id,
    teamId: row.team_id,
    gameId: row.game_id,
    appVersion: row.app_version,
    deviceId: row.device_id,
  };
}

/**
 * The platform admin's error log: the newest 200 rows from the last 7 days
 * (optionally narrowed by source and area), the 24-hour count across every
 * source and area, and the distinct areas of the last 7 days for the filter, plus the
 * health of the scheduled background jobs (empty when that lookup fails).
 */
export async function loadErrorLog(
  db: SupabaseClient,
  actorUserId: string,
  input: unknown,
): Promise<ServiceResult<ErrorLogData>> {
  const parsed = errorLogInputSchema.safeParse(input ?? {});
  if (!parsed.success) return invalidInput(parsed.error);
  const { source, area } = parsed.data;

  const { data: profile } = await db
    .from('user_profiles')
    .select('is_platform_admin')
    .eq('id', actorUserId)
    .maybeSingle();
  if (!profile?.is_platform_admin) return serviceError('forbidden', 'Platform admins only.');

  const now = Date.now();
  const weekAgo = new Date(now - 7 * DAY_MS).toISOString();
  const dayAgo = new Date(now - DAY_MS).toISOString();

  let rowsQuery = db
    .from('app_error_log')
    .select('*')
    .gte('occurred_at', weekAgo)
    .order('occurred_at', { ascending: false })
    .limit(ROW_LIMIT);
  if (source) rowsQuery = rowsQuery.eq('source', source);
  if (area) rowsQuery = rowsQuery.eq('area', area);

  const [rowsResult, countResult, areasResult, jobs] = await Promise.all([
    rowsQuery,
    db.from('app_error_log').select('id', { count: 'exact', head: true }).gte('occurred_at', dayAgo),
    db.from('app_error_log').select('area').gte('occurred_at', weekAgo).order('occurred_at', { ascending: false }).limit(AREA_SCAN_LIMIT),
    loadJobs(db, actorUserId),
  ]);

  if (rowsResult.error || countResult.error || areasResult.error) {
    const failure = rowsResult.error ?? countResult.error ?? areasResult.error;
    console.error('[loadErrorLog] query failed', { actorUserId, message: failure?.message });
    return serviceError('failed', 'Could not load the error log.');
  }

  const areas = Array.from(new Set((areasResult.data ?? []).map((r: { area: string }) => r.area))).sort();

  return serviceOk({
    rows: ((rowsResult.data ?? []) as DbRow[]).map(toRow),
    countLast24h: countResult.count ?? 0,
    areas,
    jobs,
  });
}
