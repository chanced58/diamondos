const insert = jest.fn();
const from = jest.fn(() => ({ insert }));
jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn(() => ({ from })) }));

import { createClient } from '@supabase/supabase-js';
import { buildErrorRow, reportError } from '../report-error';

const G = '11111111-1111-4111-8111-111111111111';

describe('buildErrorRow', () => {
  it('builds a truncated, sanitized row', () => {
    const row = buildErrorRow('web', 'finalize', new Error('x'.repeat(5000)), {
      gameId: G,
      userId: 'u',
      teamId: 't',
      details: { token: 't', n: 1 },
    });
    expect(row).toMatchObject({
      source: 'web',
      area: 'finalize',
      game_id: G,
      user_id: 'u',
      team_id: 't',
      details: { n: 1 },
    });
    expect(row.message).toHaveLength(2000);
  });
});

describe('reportError', () => {
  const env = { ...process.env };
  let errorSpy: jest.SpyInstance;
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'key';
    insert.mockReset();
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    process.env = { ...env };
    errorSpy.mockRestore();
  });

  it('inserts a row', async () => {
    insert.mockResolvedValue({ error: null });
    reportError('a', new Error('b'), { gameId: G });
    await new Promise((r) => setImmediate(r));
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ source: 'web', area: 'a', message: 'b' }));
  });

  it('never throws or leaves an unhandled rejection when the insert rejects', async () => {
    const unhandled = jest.fn();
    process.on('unhandledRejection', unhandled);
    insert.mockRejectedValue(new Error('db down'));
    expect(() => reportError('a', 'b')).not.toThrow();
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
    process.off('unhandledRejection', unhandled);
    expect(unhandled).not.toHaveBeenCalled();
  });

  it('never throws when the insert resolves with an error', async () => {
    insert.mockResolvedValue({ error: { message: 'nope' } });
    expect(() => reportError('a', 'b')).not.toThrow();
    await new Promise((r) => setImmediate(r));
  });

  it('still inserts one row when details are circular, and logs no secrets', async () => {
    insert.mockResolvedValue({ error: null });
    const details: Record<string, unknown> = { token: 'SECRET-TOKEN', n: 1 };
    details.self = details;
    reportError('a', 'b', { details });
    await new Promise((r) => setImmediate(r));
    expect(insert).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain('SECRET-TOKEN');
  });

  it('reuses one client across calls', async () => {
    insert.mockResolvedValue({ error: null });
    reportError('a', 'b');
    reportError('a', 'c');
    await new Promise((r) => setImmediate(r));
    expect(createClient).toHaveBeenCalledTimes(1);
  });

  it('never throws when env is missing', () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(() => reportError('a', 'b')).not.toThrow();
    expect(insert).not.toHaveBeenCalled();
  });
});
