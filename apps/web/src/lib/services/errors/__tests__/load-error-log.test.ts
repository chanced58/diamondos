import type { SupabaseClient } from '@supabase/supabase-js';
import { loadErrorLog } from '../load-error-log';
import { reportError } from '@/lib/errors/report-error';

jest.mock('@/lib/errors/report-error', () => ({ reportError: jest.fn() }));

const ADMIN = '11111111-1111-4111-8111-111111111111';

type Call = [string, ...unknown[]];

function dbRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'e1',
    occurred_at: '2026-11-14T10:00:00Z',
    source: 'web',
    area: 'game-sync',
    message: 'boom',
    details: { a: 1 },
    user_id: null,
    team_id: null,
    game_id: null,
    app_version: '1.2.3',
    device_id: null,
    ...overrides,
  };
}

function fakeDb(opts: { isAdmin: boolean; rows?: Record<string, unknown>[]; count?: number; areas?: string[]; jobs?: Record<string, unknown>[]; jobsError?: boolean }) {
  const logCalls: Call[][] = [];
  const db = {
    rpc: (name: string) => {
      expect(name).toBe('admin_job_health');
      return Promise.resolve(
        opts.jobsError ? { data: null, error: { message: 'rpc down' } } : { data: opts.jobs ?? [], error: null },
      );
    },
    from: (table: string) => {
      if (table === 'user_profiles') {
        const q = {
          select: () => q,
          eq: () => q,
          maybeSingle: () => Promise.resolve({ data: { is_platform_admin: opts.isAdmin }, error: null }),
        };
        return q;
      }
      expect(table).toBe('app_error_log');
      const calls: Call[] = [];
      logCalls.push(calls);
      const q: Record<string, unknown> = {};
      for (const name of ['select', 'gte', 'eq', 'order', 'limit']) {
        q[name] = (...args: unknown[]) => {
          calls.push([name, ...args]);
          return q;
        };
      }
      q.then = (resolve: (value: unknown) => unknown) => {
        const select = calls.find((c) => c[0] === 'select');
        const isCount = (select?.[2] as { head?: boolean } | undefined)?.head === true;
        const isAreas = select?.[1] === 'area';
        if (isCount) return resolve({ count: opts.count ?? 0, error: null });
        if (isAreas) return resolve({ data: (opts.areas ?? []).map((area) => ({ area })), error: null });
        return resolve({ data: opts.rows ?? [], error: null });
      };
      return q;
    },
  } as unknown as SupabaseClient;
  return { db, logCalls };
}

const rowsQuery = (logCalls: Call[][]) => logCalls.find((c) => c.some((x) => x[0] === 'limit' && x[1] === 200))!;

describe('loadErrorLog', () => {
  it('refuses a non-admin', async () => {
    const { db } = fakeDb({ isAdmin: false });
    const result = await loadErrorLog(db, ADMIN, {});
    expect(result).toMatchObject({ ok: false, code: 'forbidden' });
  });

  it('rejects an unknown source and an overlong area', async () => {
    const { db } = fakeDb({ isAdmin: true });
    expect(await loadErrorLog(db, ADMIN, { source: 'nope' })).toMatchObject({ ok: false, code: 'invalid' });
    expect(await loadErrorLog(db, ADMIN, { area: 'x'.repeat(65) })).toMatchObject({ ok: false, code: 'invalid' });
  });

  it('returns camel-cased rows newest first, limited to 200 and the last 7 days', async () => {
    const { db, logCalls } = fakeDb({ isAdmin: true, rows: [dbRow()], count: 4, areas: ['game-sync', 'game-sync', 'push'] });
    const result = await loadErrorLog(db, ADMIN, {});
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.countLast24h).toBe(4);
    expect(result.data.areas).toEqual(['game-sync', 'push']);
    expect(result.data.rows[0]).toEqual({
      id: 'e1',
      occurredAt: '2026-11-14T10:00:00Z',
      source: 'web',
      area: 'game-sync',
      message: 'boom',
      details: { a: 1 },
      userId: null,
      teamId: null,
      gameId: null,
      appVersion: '1.2.3',
      deviceId: null,
    });
    const calls = rowsQuery(logCalls);
    expect(calls).toContainEqual(['order', 'occurred_at', { ascending: false }]);
    const gte = calls.find((c) => c[0] === 'gte')!;
    const ageMs = Date.now() - Date.parse(gte[2] as string);
    expect(Math.abs(ageMs - 7 * 24 * 3600 * 1000)).toBeLessThan(60_000);
  });

  it('applies the source and area filters to the rows but not to the count', async () => {
    const { db, logCalls } = fakeDb({ isAdmin: true });
    await loadErrorLog(db, ADMIN, { source: 'mobile', area: 'sync' });
    const calls = rowsQuery(logCalls);
    expect(calls).toContainEqual(['eq', 'source', 'mobile']);
    expect(calls).toContainEqual(['eq', 'area', 'sync']);
    const countCalls = logCalls.find((c) => c.some((x) => x[0] === 'select' && (x[2] as { head?: boolean })?.head))!;
    expect(countCalls.some((c) => c[0] === 'eq')).toBe(false);
    const gte = countCalls.find((c) => c[0] === 'gte')!;
    const ageMs = Date.now() - Date.parse(gte[2] as string);
    expect(Math.abs(ageMs - 24 * 3600 * 1000)).toBeLessThan(60_000);
  });

  it('orders the area scan newest first so recent areas survive the limit', async () => {
    const { db, logCalls } = fakeDb({ isAdmin: true });
    await loadErrorLog(db, ADMIN, {});
    const areaCalls = logCalls.find((c) => c.some((x) => x[0] === 'select' && x[1] === 'area'))!;
    expect(areaCalls).toContainEqual(['order', 'occurred_at', { ascending: false }]);
  });

  it('keeps a null enabled flag for a missing cron job', async () => {
    const { db } = fakeDb({
      isAdmin: true,
      jobs: [{ job: 'prune-logs', enabled: null, last_run_at: null, last_status: null, last_ok: null, last_success_at: null, calls_24h: 0, failures_24h: 0 }],
    });
    const result = await loadErrorLog(db, ADMIN, {});
    expect(result.ok && result.data.jobs[0].enabled).toBeNull();
  });

  it('maps admin_job_health rows to camel-cased jobs', async () => {
    const { db } = fakeDb({
      isAdmin: true,
      jobs: [
        {
          job: 'pitch-count-calculator',
          enabled: true,
          last_run_at: '2026-11-14T10:00:00Z',
          last_status: 200,
          last_ok: true,
          last_success_at: '2026-11-14T10:00:00Z',
          calls_24h: 12,
          failures_24h: 1,
        },
      ],
    });
    const result = await loadErrorLog(db, ADMIN, {});
    expect(result.ok && result.data.jobs).toEqual([
      {
        job: 'pitch-count-calculator',
        enabled: true,
        lastRunAt: '2026-11-14T10:00:00Z',
        lastStatus: 200,
        lastOk: true,
        lastSuccessAt: '2026-11-14T10:00:00Z',
        calls24h: 12,
        failures24h: 1,
      },
    ]);
  });

  it('returns no jobs and reports when the job health RPC fails', async () => {
    const { db } = fakeDb({ isAdmin: true, jobsError: true, rows: [dbRow()] });
    const result = await loadErrorLog(db, ADMIN, {});
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.jobs).toEqual([]);
    expect(result.data.rows).toHaveLength(1);
    expect(reportError).toHaveBeenCalledWith('admin.job-health', expect.anything(), { userId: ADMIN });
  });
});
