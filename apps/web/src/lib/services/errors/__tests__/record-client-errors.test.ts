import type { SupabaseClient } from '@supabase/supabase-js';
import { recordClientErrors } from '../record-client-errors';

const ACTOR = '11111111-1111-4111-8111-111111111111';

function entry(overrides: Record<string, unknown> = {}) {
  return { area: 'sync', message: 'boom', occurredAt: new Date().toISOString(), ...overrides };
}

function fakeDb(insertError: { message: string } | null = null) {
  const inserted: Array<Record<string, unknown>[]> = [];
  const db = {
    from: (table: string) => ({
      insert: (rows: Record<string, unknown>[]) => {
        expect(table).toBe('app_error_log');
        inserted.push(rows);
        return Promise.resolve({ error: insertError });
      },
    }),
  } as unknown as SupabaseClient;
  return { db, inserted };
}

describe('recordClientErrors', () => {
  beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => undefined));
  afterEach(() => jest.restoreAllMocks());

  it('inserts each entry stamped with the actor and source', async () => {
    const { db, inserted } = fakeDb();
    const result = await recordClientErrors(db, ACTOR, { entries: [entry(), entry({ area: 'push' })] }, 'mobile');
    expect(result).toEqual({ ok: true, data: { recorded: 2 } });
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toHaveLength(2);
    expect(inserted[0][0]).toMatchObject({ user_id: ACTOR, source: 'mobile', area: 'sync' });
  });

  it('drops entries older than the max age', async () => {
    const { db, inserted } = fakeDb();
    const old = new Date(Date.now() - 8 * 24 * 3600 * 1000).toISOString();
    const result = await recordClientErrors(db, ACTOR, { entries: [entry(), entry({ occurredAt: old })] }, 'web_client');
    expect(result).toEqual({ ok: true, data: { recorded: 1 } });
    expect(inserted[0]).toHaveLength(1);
  });

  it('drops entries too far in the future and skips the insert when none remain', async () => {
    const { db, inserted } = fakeDb();
    const future = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const result = await recordClientErrors(db, ACTOR, { entries: [entry({ occurredAt: future })] }, 'mobile');
    expect(result).toEqual({ ok: true, data: { recorded: 0 } });
    expect(inserted).toHaveLength(0);
  });

  it('sanitizes details', async () => {
    const { db, inserted } = fakeDb();
    await recordClientErrors(db, ACTOR, { entries: [entry({ details: { token: 'abc', code: 7 } })] }, 'mobile');
    const details = inserted[0][0].details as Record<string, unknown>;
    expect(details).not.toHaveProperty('token');
    expect(details.code).toBe(7);
  });

  it('rejects more than 50 entries', async () => {
    const { db } = fakeDb();
    const result = await recordClientErrors(db, ACTOR, { entries: Array.from({ length: 51 }, () => entry()) }, 'mobile');
    expect(result).toMatchObject({ ok: false, code: 'invalid' });
  });

  it('returns failed when the insert is rejected', async () => {
    const { db } = fakeDb({ message: 'nope' });
    const result = await recordClientErrors(db, ACTOR, { entries: [entry()] }, 'mobile');
    expect(result).toMatchObject({ ok: false, code: 'failed' });
  });

  it('uses the header version when an entry has none', async () => {
    const { db, inserted } = fakeDb();
    await recordClientErrors(db, ACTOR, { entries: [entry(), entry({ appVersion: '2.0.0' })] }, 'mobile', '1.4.0');
    expect(inserted[0][0].app_version).toBe('1.4.0');
    expect(inserted[0][1].app_version).toBe('2.0.0');
  });

  it('caps the header version at 32 characters', async () => {
    const { db, inserted } = fakeDb();
    await recordClientErrors(db, ACTOR, { entries: [entry()] }, 'mobile', 'v'.repeat(40));
    expect(inserted[0][0].app_version).toBe('v'.repeat(32));
  });
});
