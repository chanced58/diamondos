const insert = jest.fn();
const from = jest.fn(() => ({ insert }));
jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn(() => ({ from })) }));

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

  it('never throws when env is missing', () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(() => reportError('a', 'b')).not.toThrow();
    expect(insert).not.toHaveBeenCalled();
  });
});
