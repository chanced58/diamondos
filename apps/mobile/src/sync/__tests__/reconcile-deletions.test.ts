import {
  applyBlastRadiusGuard,
  computeCascadeDeletions,
  computeDeletions,
  computeTableDeletion,
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

describe('applyBlastRadiusGuard', () => {
  it('passes through an empty deletion list untouched', () => {
    expect(applyBlastRadiusGuard([], 100)).toEqual({ ids: [], guarded: false, attemptedCount: 0 });
  });

  it('passes through a small deletion well under both thresholds', () => {
    // 2 of 28 synced rows (~7%), far under the 25% fraction and the 100 floor.
    expect(applyBlastRadiusGuard(['a', 'b'], 28)).toEqual({
      ids: ['a', 'b'],
      guarded: false,
      attemptedCount: 2,
    });
  });

  it('round-2 N2: applies a near-total wipe of a small table — the fraction no longer binds tiny tables', () => {
    // 3 of 4 synced rows (75%). Round-1 guarded this; round-2 review (N2)
    // found that binding the fraction below minSyncedForFraction made the
    // guard a PERMANENT no-op on any device holding a handful of rows —
    // exactly H3's own motivating case (one stale game on an early-season
    // device). Below the minimum, only the absolute floor protects a table,
    // so this now applies.
    const ids = ['a', 'b', 'c'];
    expect(applyBlastRadiusGuard(ids, 4)).toEqual({ ids, guarded: false, attemptedCount: 3 });
  });

  it('round-2 N2: deleting 1 of 3 synced rows now applies (was a permanent no-op)', () => {
    // The exact scenario the finding traced: syncedRowCount=3, deleting 1 —
    // under the old spec 1 > 0.25*3 (0.75) tripped the guard every cycle
    // forever, since the denominator never changes. This is the primary
    // regression test for N2.
    expect(applyBlastRadiusGuard(['a'], 3)).toEqual({ ids: ['a'], guarded: false, attemptedCount: 1 });
  });

  it('round-2 N2: a genuine mass deletion (20 of 24) is still suppressed once minSyncedForFraction is reached', () => {
    // 24 >= minSyncedForFraction (8), so the fraction check is active:
    // 20 > 0.25 * 24 (6) trips it. This is the counterpart to the previous
    // test — the fix must not simply disable the fraction guard everywhere.
    const ids = Array.from({ length: 20 }, (_, i) => `id-${i}`);
    expect(applyBlastRadiusGuard(ids, 24)).toEqual({ ids: [], guarded: true, attemptedCount: 20 });
  });

  it('round-2 N2: pins the minSyncedForFraction boundary itself, both sides', () => {
    // Below the threshold (7 rows): fraction never engages, even at a ratio
    // that would trip it above the threshold.
    expect(applyBlastRadiusGuard(['a', 'b', 'c'], 7).guarded).toBe(false); // 3 of 7 = ~43%
    // At the threshold (8 rows): fraction is active and this ratio trips it.
    expect(applyBlastRadiusGuard(['a', 'b', 'c'], 8).guarded).toBe(true); // 3 of 8 = 37.5% > 25%
  });

  it('preserves the attempted count when guarded, for diagnostic logging', () => {
    // The guard discards `ids` (that's the whole point), but a caller
    // logging "why was this guarded" needs the count that was suppressed,
    // not just "something, we don't know how much".
    const ids = Array.from({ length: 500 }, (_, i) => `id-${i}`);
    expect(applyBlastRadiusGuard(ids, 1_000_000).attemptedCount).toBe(500);
  });

  it('does not guard exactly at the fraction boundary (25% of synced rows)', () => {
    // 25 of 100 is exactly the fraction — the guard uses a strict `>`, so
    // this must still pass through.
    const ids = Array.from({ length: 25 }, (_, i) => `id-${i}`);
    expect(applyBlastRadiusGuard(ids, 100).guarded).toBe(false);
  });

  it('guards just above the fraction boundary', () => {
    const ids = Array.from({ length: 26 }, (_, i) => `id-${i}`);
    expect(applyBlastRadiusGuard(ids, 100).guarded).toBe(true);
  });

  it('guards when the absolute floor is exceeded even though the ratio is small', () => {
    // 150 of 10,000 synced rows is 1.5% — nowhere near the 25% fraction —
    // but 150 absolute rows gone is still a large blast radius worth halting.
    const ids = Array.from({ length: 150 }, (_, i) => `id-${i}`);
    expect(applyBlastRadiusGuard(ids, 10_000).guarded).toBe(true);
  });

  it('does not guard exactly at the floor boundary', () => {
    const ids = Array.from({ length: 100 }, (_, i) => `id-${i}`);
    expect(applyBlastRadiusGuard(ids, 1_000_000).guarded).toBe(false);
  });

  it('respects custom fraction/floor options', () => {
    expect(applyBlastRadiusGuard(['a', 'b'], 10, { fraction: 0.1 }).guarded).toBe(true);
    expect(applyBlastRadiusGuard(['a'], 10, { floor: 0 }).guarded).toBe(true);
  });
});

describe('computeTableDeletion', () => {
  it('reports fetch-failed and deletes nothing when serverIds is null', () => {
    const localRows = [{ id: 'a', syncedAt: 100 }];
    expect(computeTableDeletion(null, localRows)).toEqual({
      ids: [],
      status: 'fetch-failed',
      attemptedCount: 0,
    });
  });

  it('reports ok and the safety-rule diff when the fetch succeeded and the result is small', () => {
    // 9 synced rows plus 1 unsynced; only 1 of the 9 synced rows is deleted
    // (~11%), comfortably under both blast-radius thresholds.
    const localRows = [
      ...Array.from({ length: 9 }, (_, i) => ({ id: `keep-${i}`, syncedAt: 100 })),
      { id: 'gone', syncedAt: 100 },
      { id: 'never-pushed', syncedAt: null },
    ];
    const serverIds = new Set(localRows.filter((r) => r.id !== 'gone' && r.id !== 'never-pushed').map((r) => r.id));
    expect(computeTableDeletion(serverIds, localRows)).toEqual({
      ids: ['gone'],
      status: 'ok',
      attemptedCount: 1,
    });
  });

  it('reports blast-radius-guarded and deletes nothing when the diff is disproportionate', () => {
    // 150 synced rows, all deleted: well past minSyncedForFraction (8) so the
    // fraction check is live (100% far exceeds 25%), and also past the
    // absolute floor (100) independently — guarded either way. (A 4-row
    // table at 100% is deliberately NOT guarded post-round-2 — see the
    // dedicated N2 tests in the applyBlastRadiusGuard suite above.)
    const localRows = Array.from({ length: 150 }, (_, i) => ({ id: `id-${i}`, syncedAt: 100 }));
    expect(computeTableDeletion(new Set(), localRows)).toEqual({
      ids: [],
      status: 'blast-radius-guarded',
      attemptedCount: 150,
    });
  });

  it('applies the same ok/fetch-failed mapping uniformly regardless of which "table" is passed', () => {
    // This is the direct counter to a copy-paste bug where one table's id
    // set is used unconditionally for another (round-1 finding, Important 5,
    // point 3): every table goes through this one function, so there is
    // exactly one place the "ok ? ids : null" mapping can be wrong, and it
    // is covered here for both branches.
    // 9 padding rows keep the single deletion well under the blast-radius
    // fraction so 'ok' is the outcome under test, not a guard.
    const padding = Array.from({ length: 9 }, (_, i) => ({ id: `keep-${i}`, syncedAt: 1 }));
    const tables = [
      { serverIds: new Set(padding.map((r) => r.id)), localRows: [...padding, { id: 'gone', syncedAt: 1 }] },
      { serverIds: null, localRows: [...padding, { id: 'gone', syncedAt: 1 }] },
    ];
    expect(computeTableDeletion(tables[0].serverIds, tables[0].localRows)).toEqual({
      ids: ['gone'],
      status: 'ok',
      attemptedCount: 1,
    });
    expect(computeTableDeletion(tables[1].serverIds, tables[1].localRows)).toEqual({
      ids: [],
      status: 'fetch-failed',
      attemptedCount: 0,
    });
  });
});
