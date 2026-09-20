import { readNextSequenceNumber, type SequenceSource } from '../sequence-number';

/**
 * A fake `Collection<GameEvent>` backed by a mutable row list, so a test can
 * change what is stored between two reads — which is exactly what the sync
 * engine's collision handler does to local rows in production.
 */
function fakeEvents(initial: number[]): {
  events: SequenceSource;
  store: { sequenceNumbers: number[] };
  calls: unknown[][];
} {
  const store = { sequenceNumbers: [...initial] };
  const calls: unknown[][] = [];
  const events: SequenceSource = {
    query(...clauses: unknown[]) {
      calls.push(clauses);
      return {
        fetch: async () =>
          [...store.sequenceNumbers]
            .sort((a, b) => b - a)
            .slice(0, 1)
            .map((sequenceNumber) => ({ sequenceNumber })),
      };
    },
  };
  return { events, store, calls };
}

describe('readNextSequenceNumber', () => {
  it('should start a game with no events at 1', async () => {
    const { events } = fakeEvents([]);
    await expect(readNextSequenceNumber(events, 'game-1')).resolves.toBe(1);
  });

  it('should take one above the highest stored sequence number', async () => {
    const { events } = fakeEvents([3, 7, 5]);
    await expect(readNextSequenceNumber(events, 'game-1')).resolves.toBe(8);
  });

  it('should see a renumber that happened between two events instead of reusing a stale count', async () => {
    // A fresh install seeds from a local store the pull has not filled yet.
    const { events, store } = fakeEvents([]);
    await expect(readNextSequenceNumber(events, 'game-1')).resolves.toBe(1);
    store.sequenceNumbers.push(1);

    // The push collides with the server's 48 events; the sync engine rewrites
    // the local row to 49. A counter cached at mount time would now hand out
    // 2 — colliding again, forever. A fresh read hands out 50.
    store.sequenceNumbers = [49];
    await expect(readNextSequenceNumber(events, 'game-1')).resolves.toBe(50);
  });

  it('should read the store again on every call rather than once', async () => {
    const { events, calls } = fakeEvents([1]);
    await readNextSequenceNumber(events, 'game-1');
    await readNextSequenceNumber(events, 'game-1');
    expect(calls).toHaveLength(2);
  });
});

describe('readNextSequenceNumber query', () => {
  it('should scope the read to the game being scored, highest first, one row', async () => {
    const { events, calls } = fakeEvents([]);
    await readNextSequenceNumber(events, 'game-42');
    expect(calls[0]).toEqual([
      expect.objectContaining({ type: 'where', left: 'game_remote_id', comparison: expect.objectContaining({ right: expect.objectContaining({ value: 'game-42' }) }) }),
      expect.objectContaining({ type: 'sortBy', sortColumn: 'sequence_number', sortOrder: 'desc' }),
      expect.objectContaining({ type: 'take', count: 1 }),
    ]);
  });
});
