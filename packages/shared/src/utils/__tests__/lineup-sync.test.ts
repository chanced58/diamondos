import { computeLineupDeletes, decideLineupPush } from '../lineup-sync';

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
