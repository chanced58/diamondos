import {
  computeLineupDeletes,
  decideLineupPush,
  getLineupSlotCap,
  resolveBattingOrderCollisions,
} from '../lineup-sync';

describe('decideLineupPush', () => {
  it('should push while the game is in progress regardless of timestamps', () => {
    expect(
      decideLineupPush({
        gameStatus: 'in_progress',
        serverMaxUpdatedAtMs: 2_000,
        localEditedAtMs: 1_000,
      }),
    ).toBe('push');
  });

  it('should push when the server has no lineup rows yet', () => {
    expect(
      decideLineupPush({
        gameStatus: 'scheduled',
        serverMaxUpdatedAtMs: null,
        localEditedAtMs: 1_000,
      }),
    ).toBe('push');
  });

  it('should skip a scheduled game when the server edit is newer', () => {
    expect(
      decideLineupPush({
        gameStatus: 'scheduled',
        serverMaxUpdatedAtMs: 2_000,
        localEditedAtMs: 1_000,
      }),
    ).toBe('skip');
  });

  it('should push a scheduled game when the local edit is newer', () => {
    expect(
      decideLineupPush({
        gameStatus: 'scheduled',
        serverMaxUpdatedAtMs: 1_000,
        localEditedAtMs: 2_000,
      }),
    ).toBe('push');
  });

  it('should favor the device on equal timestamps', () => {
    expect(
      decideLineupPush({
        gameStatus: 'scheduled',
        serverMaxUpdatedAtMs: 1_000,
        localEditedAtMs: 1_000,
      }),
    ).toBe('push');
  });

  it('should apply last-write-wins to completed games too', () => {
    expect(
      decideLineupPush({
        gameStatus: 'completed',
        serverMaxUpdatedAtMs: 2_000,
        localEditedAtMs: 1_000,
      }),
    ).toBe('skip');
    expect(
      decideLineupPush({
        gameStatus: 'completed',
        serverMaxUpdatedAtMs: 1_000,
        localEditedAtMs: 2_000,
      }),
    ).toBe('push');
  });
});

describe('computeLineupDeletes', () => {
  it('should return local ids missing from the server after a web delete-reinsert', () => {
    expect(computeLineupDeletes(['c', 'd'], ['a', 'b', 'c'])).toEqual(['a', 'b']);
  });

  it('should return nothing when the sets match', () => {
    expect(computeLineupDeletes(['a', 'b'], ['a', 'b'])).toEqual([]);
  });

  it('should return nothing when the device has no synced rows', () => {
    expect(computeLineupDeletes(['a', 'b'], [])).toEqual([]);
  });

  it('should delete all local rows when the server has none', () => {
    expect(computeLineupDeletes([], ['a', 'b'])).toEqual(['a', 'b']);
  });
});

describe('getLineupSlotCap', () => {
  it('should offer at least 9 slots for small rosters', () => {
    expect(getLineupSlotCap(7, 30)).toBe(9);
  });

  it('should offer one slot per roster player up to the league cap', () => {
    expect(getLineupSlotCap(14, 30)).toBe(14);
    expect(getLineupSlotCap(14, 12)).toBe(12);
  });
});

describe('resolveBattingOrderCollisions', () => {
  const synced = (id: string, order: number | null) => ({
    id,
    battingOrder: order,
    isDirty: false,
    updatedAtMs: 0,
  });
  const dirty = (id: string, order: number | null, updatedAtMs = 1_000) => ({
    id,
    battingOrder: order,
    isDirty: true,
    updatedAtMs,
  });

  it('should return no adjustments when there are no collisions', () => {
    expect(
      resolveBattingOrderCollisions([synced('a', 1), dirty('b', 2)], 30).size,
    ).toBe(0);
  });

  it('should move a dirty row colliding with a synced row to the end of the order', () => {
    const adjustments = resolveBattingOrderCollisions(
      [synced('a', 1), synced('b', 2), dirty('c', 1)],
      30,
    );
    expect(adjustments.get('c')).toBe(3);
  });

  it('should renumber colliding dirty rows oldest edit first', () => {
    const adjustments = resolveBattingOrderCollisions(
      [synced('a', 5), dirty('b', 5, 2_000), dirty('c', 5, 1_000)],
      30,
    );
    expect(adjustments.get('c')).toBe(6); // older edit gets the earlier slot
    expect(adjustments.get('b')).toBe(7);
  });

  it('should bench a colliding row when the order is at the cap', () => {
    const adjustments = resolveBattingOrderCollisions(
      [synced('a', 1), synced('b', 2), dirty('c', 2)],
      2,
    );
    expect(adjustments.get('c')).toBeNull();
  });

  it('should ignore rows without a batting order', () => {
    expect(
      resolveBattingOrderCollisions([synced('a', 1), dirty('p', null)], 30).size,
    ).toBe(0);
  });
});
