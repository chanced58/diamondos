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

  it('round-2 N2: deleting 1 of 3 synced rows applies (was a permanent no-op before N2)', () => {
    // The exact scenario N2 traced: syncedRowCount=3, deleting 1 — under the
    // pre-N2 spec 1 > 0.25*3 (0.75) tripped the guard every cycle forever,
    // since the denominator never changes. count=1 is below
    // minCountForFraction (3), so the fraction never engages here regardless
    // of table size. This is the regression test for N2, still valid under
    // round-3's count-gated version: H3's own symptom (one stuck row) must
    // always apply.
    expect(applyBlastRadiusGuard(['a'], 3)).toEqual({ ids: ['a'], guarded: false, attemptedCount: 1 });
  });

  it('round-3 R3-1: a 3-row wipe of a 3-row table is guarded — round-2 let this through unconditionally', () => {
    // 3 of 3 synced rows (100%). Round-2's syncedRowCount>=8 gate let this
    // apply unconditionally (synced=3 never reaches 8, so the fraction never
    // engaged regardless of ratio). Round-3 review found that a device with
    // ≤7 games — every device early in a season — therefore had NO
    // proportional protection on `games`, whose cascade to `game_events`
    // carries no syncedAt guard. Gating on the deletion COUNT (>=3) instead
    // of table size catches this: count=3 clears the count gate, and 3 >
    // 0.25*3 (0.75) trips the fraction.
    const ids = ['a', 'b', 'c'];
    expect(applyBlastRadiusGuard(ids, 3)).toEqual({ ids: [], guarded: true, attemptedCount: 3 });
  });

  it('round-3 R3-1: a 7-row wipe of a 7-row table is guarded', () => {
    // 7 of 7 (100%) — same reasoning as the 3-of-3 case above, at the other
    // end of the "every device early in a season" range the finding named.
    const ids = Array.from({ length: 7 }, (_, i) => `id-${i}`);
    expect(applyBlastRadiusGuard(ids, 7)).toEqual({ ids: [], guarded: true, attemptedCount: 7 });
  });

  it('round-2 N2: a genuine mass deletion (20 of 24) is still suppressed', () => {
    // count=20 clears the count gate (>=3), and 20 > 0.25*24 (6) trips the
    // fraction. This is the counterpart to the single-row test above — the
    // fix must not simply disable the fraction guard everywhere.
    const ids = Array.from({ length: 20 }, (_, i) => `id-${i}`);
    expect(applyBlastRadiusGuard(ids, 24)).toEqual({ ids: [], guarded: true, attemptedCount: 20 });
  });

  it('round-3 R3-1: pins the minCountForFraction boundary itself, both sides', () => {
    // Below the threshold (count=2): fraction never engages, however high
    // the ratio.
    expect(applyBlastRadiusGuard(['a', 'b'], 4).guarded).toBe(false); // 2 of 4 = 50%
    // At the threshold (count=3): fraction is active and this ratio trips it
    // — this is also the exact "3 of 4" case round-2 shipped as "applies,"
    // which round-3 review found should have been guarded all along.
    expect(applyBlastRadiusGuard(['a', 'b', 'c'], 4).guarded).toBe(true); // 3 of 4 = 75%
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

  it('respects custom fraction/floor/minCountForFraction options', () => {
    // count=3 clears the default minCountForFraction (3), so a custom,
    // tighter fraction can still trip it: 3 > 0.1*10 (1).
    expect(applyBlastRadiusGuard(['a', 'b', 'c'], 10, { fraction: 0.1 }).guarded).toBe(true);
    // floor=0 guards any non-empty deletion regardless of the count gate.
    expect(applyBlastRadiusGuard(['a'], 10, { floor: 0 }).guarded).toBe(true);
    // A custom minCountForFraction can re-widen the exemption round-3
    // narrowed — e.g. restoring round-2-like behavior for a caller that
    // wants it: count=2 stays exempt from the fraction up to a custom
    // minimum of 5, even at a high ratio.
    expect(
      applyBlastRadiusGuard(['a', 'b'], 4, { minCountForFraction: 5 }).guarded,
    ).toBe(false); // 2 of 4 = 50%, but count(2) < minCountForFraction(5)
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
    // 150 synced rows, all deleted: well past minCountForFraction (3) so the
    // fraction check is live (100% far exceeds 25%), and also past the
    // absolute floor (100) independently — guarded either way. Under the
    // shipped expression a much smaller table wiped at 100% is guarded too
    // (e.g. a 4-row table: count 4 >= 3 and 4 > 0.25*4) — see the
    // minCountForFraction boundary tests in the applyBlastRadiusGuard suite
    // above (:164-171).
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
