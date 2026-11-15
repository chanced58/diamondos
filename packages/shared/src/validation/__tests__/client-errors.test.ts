import {
  clientErrorBatchSchema,
  clientErrorEntrySchema,
  errorMessageOf,
  sanitizeErrorDetails,
} from '../client-errors';

const entry = { area: 'a', message: 'm', occurredAt: '2026-11-14T00:00:00.000Z' };

describe('sanitizeErrorDetails', () => {
  it('drops secret-looking keys at any depth', () => {
    expect(
      sanitizeErrorDetails({ gameId: 'g1', token: 'x', nested: { Authorization: 'y', email: 'a@b.c', ok: 1 } }),
    ).toEqual({ gameId: 'g1', nested: { ok: 1 } });
  });
  it('survives a circular reference', () => {
    const a: Record<string, unknown> = { id: 1 };
    a.self = a;
    expect(sanitizeErrorDetails(a)).toEqual({ id: 1, self: '[circular]' });
  });
  it('replaces oversized details', () => {
    expect(sanitizeErrorDetails({ blob: 'x'.repeat(20_000) })).toEqual({ truncated: true });
  });
  it('returns {} for non-objects', () => {
    expect(sanitizeErrorDetails('nope')).toEqual({});
    expect(sanitizeErrorDetails(undefined)).toEqual({});
  });
  it('keeps arrays, sanitizing their elements', () => {
    expect(sanitizeErrorDetails({ list: [{ token: 't', n: 1 }, 2] })).toEqual({ list: [{ n: 1 }, 2] });
  });
  it('never throws on throwing getters, BigInt or functions', () => {
    const bad = {
      get boom(): unknown {
        throw new Error('x');
      },
      big: BigInt(1),
      fn: () => 1,
      ok: 1,
    };
    expect(sanitizeErrorDetails(bad)).toEqual({
      boom: '[unserializable]',
      big: '[unserializable]',
      fn: '[unserializable]',
      ok: 1,
    });
  });
});

describe('errorMessageOf', () => {
  it('reads a message from anything', () => {
    expect(errorMessageOf(new Error('boom'))).toBe('boom');
    expect(errorMessageOf(undefined)).toBe('undefined');
    expect(errorMessageOf('x'.repeat(1_000_000))).toHaveLength(2000);
  });
});

describe('client error schemas', () => {
  it('accepts a valid entry', () => {
    expect(clientErrorEntrySchema.safeParse(entry).success).toBe(true);
  });
  it('rejects a batch of 51 and an empty batch', () => {
    expect(clientErrorBatchSchema.safeParse({ entries: [] }).success).toBe(false);
    expect(clientErrorBatchSchema.safeParse({ entries: Array(51).fill(entry) }).success).toBe(false);
    expect(clientErrorBatchSchema.safeParse({ entries: Array(50).fill(entry) }).success).toBe(true);
  });
});
