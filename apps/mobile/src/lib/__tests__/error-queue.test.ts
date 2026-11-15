import type { ClientErrorEntry } from '@baseball/shared';
import { enqueueError, ERROR_QUEUE_KEY, ERROR_QUEUE_MAX, parseErrorQueue } from '../error-queue';

function entry(message: string): ClientErrorEntry {
  return { area: 'sync.failed', message, occurredAt: '2026-11-14T12:00:00.000Z' };
}

describe('error-queue', () => {
  it('should use the errors.pending register and hold at most 50 entries', () => {
    expect(ERROR_QUEUE_KEY).toBe('errors.pending');
    expect(ERROR_QUEUE_MAX).toBe(50);
  });

  it('treats corrupt or non-array input as empty', () => {
    expect(parseErrorQueue('{not json')).toEqual([]);
    expect(parseErrorQueue({})).toEqual([]);
    expect(parseErrorQueue(null)).toEqual([]);
    expect(parseErrorQueue(undefined)).toEqual([]);
    expect(parseErrorQueue('{"a":1}')).toEqual([]);
  });

  it('drops invalid entries and keeps valid ones', () => {
    const valid = entry('boom');
    expect(parseErrorQueue(JSON.stringify([valid, { area: 1 }]))).toEqual([valid]);
    expect(parseErrorQueue([valid, null, 'x'])).toEqual([valid]);
  });

  it('keeps the newest 50', () => {
    const q = Array.from({ length: 60 }, (_, i) => entry(`m${i}`)).reduce(enqueueError, [] as ClientErrorEntry[]);
    expect(q).toHaveLength(50);
    expect(q[0].message).toBe('m10');
    expect(q[49].message).toBe('m59');
  });

  it('should not mutate the queue it is given', () => {
    const queue = [entry('a')];
    const next = enqueueError(queue, entry('b'));
    expect(queue).toHaveLength(1);
    expect(next.map((e) => e.message)).toEqual(['a', 'b']);
  });
});
