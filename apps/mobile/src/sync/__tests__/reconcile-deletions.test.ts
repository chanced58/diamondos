import {
  computeCascadeDeletions,
  computeDeletions,
  reconcileIfFetchSucceeded,
} from '../reconcile-deletions';

describe('computeDeletions', () => {
  it('deletes a synced local row absent from the server set', () => {
    const serverIds = new Set(['a']);
    const localRows = [{ id: 'a', syncedAt: 100 }, { id: 'b', syncedAt: 100 }];
    expect(computeDeletions(serverIds, localRows)).toEqual(['b']);
  });

  it('never deletes an unsynced local row, even if absent from the server set — the safety rule', () => {
    const serverIds = new Set<string>();
    const localRows = [{ id: 'offline-game-1', syncedAt: null }];
    expect(computeDeletions(serverIds, localRows)).toEqual([]);
  });

  it('treats undefined syncedAt the same as null — also not deleted', () => {
    const serverIds = new Set<string>();
    const localRows = [{ id: 'offline-game-2', syncedAt: undefined }];
    expect(computeDeletions(serverIds, localRows)).toEqual([]);
  });

  it('does not delete a synced local row present in the server set', () => {
    const serverIds = new Set(['a', 'b']);
    const localRows = [{ id: 'a', syncedAt: 100 }, { id: 'b', syncedAt: 100 }];
    expect(computeDeletions(serverIds, localRows)).toEqual([]);
  });

  it('deletes every synced row when the server set is genuinely empty, proving the function is honest', () => {
    const serverIds = new Set<string>();
    const localRows = [
      { id: 'a', syncedAt: 100 },
      { id: 'b', syncedAt: 200 },
      { id: 'c', syncedAt: 300 },
    ];
    expect(computeDeletions(serverIds, localRows).sort()).toEqual(['a', 'b', 'c']);
  });

  it('mixes synced and unsynced rows correctly against an empty server set', () => {
    const serverIds = new Set<string>();
    const localRows = [
      { id: 'synced-and-gone', syncedAt: 100 },
      { id: 'never-pushed', syncedAt: null },
    ];
    expect(computeDeletions(serverIds, localRows)).toEqual(['synced-and-gone']);
  });
});

describe('reconcileIfFetchSucceeded', () => {
  const localRows = [
    { id: 'a', syncedAt: 100 },
    { id: 'b', syncedAt: 200 },
  ];

  it('reconciles nothing when the id fetch failed (serverIds is null)', () => {
    // This is the caller-level counterpart to computeDeletions' "empty set
    // deletes everything" test above: an empty server set (real: fetch
    // succeeded, table is truly empty) and a failed fetch (serverIds unknown)
    // must produce opposite results, or a network blip would look identical
    // to the server having deleted every row.
    expect(reconcileIfFetchSucceeded(null, localRows)).toEqual([]);
  });

  it('reconciles normally when the id fetch succeeded, even with an empty result', () => {
    expect(reconcileIfFetchSucceeded(new Set(), localRows).sort()).toEqual(['a', 'b']);
  });

  it('delegates to computeDeletions when the fetch succeeded with some ids', () => {
    expect(reconcileIfFetchSucceeded(new Set(['a']), localRows)).toEqual(['b']);
  });
});

describe('computeCascadeDeletions', () => {
  it('cascades deletion to child rows of a deleted parent', () => {
    const deletedGameIds = ['game-1'];
    const localEvents = [
      { id: 'evt-1', parentId: 'game-1' },
      { id: 'evt-2', parentId: 'game-1' },
      { id: 'evt-3', parentId: 'game-2' },
    ];
    expect(computeCascadeDeletions(deletedGameIds, localEvents).sort()).toEqual(['evt-1', 'evt-2']);
  });

  it('leaves events of surviving games untouched', () => {
    const deletedGameIds = ['game-1'];
    const localEvents = [{ id: 'evt-3', parentId: 'game-2' }];
    expect(computeCascadeDeletions(deletedGameIds, localEvents)).toEqual([]);
  });

  it('returns nothing when no parents were deleted', () => {
    const localEvents = [{ id: 'evt-1', parentId: 'game-1' }];
    expect(computeCascadeDeletions([], localEvents)).toEqual([]);
  });

  it('does not apply a syncedAt guard — an unsynced event of a deleted game is still cascaded', () => {
    // Unlike computeDeletions, cascade deletion has no syncedAt safety check:
    // once the parent game is confirmed gone server-side, every local event
    // referencing it corresponds to a game that no longer exists, regardless
    // of whether that particular event row had synced yet.
    const deletedGameIds = ['game-1'];
    const localEvents = [{ id: 'unsynced-evt', parentId: 'game-1' }];
    expect(computeCascadeDeletions(deletedGameIds, localEvents)).toEqual(['unsynced-evt']);
  });
});
