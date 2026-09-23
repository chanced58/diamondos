// sync-engine.ts also touches WatermelonDB (../db) and the Supabase client
// (../lib/supabase) at module scope; stub both so importing it in a plain
// Jest/node environment doesn't reach for native SQLite or a real client.
jest.mock('../../db', () => ({
  database: {},
}));
jest.mock('../../lib/supabase', () => ({
  getSupabaseClient: jest.fn(),
}));

import {
  isFinalizeConfigured,
  getFinalizeFailureCount,
  fetchAllRows,
  shouldReconcileDeletions,
} from '../sync-engine';

describe('isFinalizeConfigured', () => {
  it('is true when given a non-empty API base URL', () => {
    expect(isFinalizeConfigured('http://localhost:3000')).toBe(true);
  });

  it('is false when given an empty string', () => {
    expect(isFinalizeConfigured('')).toBe(false);
  });

  it('is false when given undefined', () => {
    expect(isFinalizeConfigured(undefined)).toBe(false);
  });

});

describe('getFinalizeFailureCount', () => {
  it('is 0 for a game with no recorded finalize failures', () => {
    // reconcileGameLifecycle (which increments this) is not exported and
    // needs a full WatermelonDB/Supabase/fetch mock to exercise end to end —
    // out of proportion here (see report). This pins the getter's contract
    // for a game it has never seen, which is what score.tsx relies on to
    // render the "pending" (not "persistently-failing") state by default.
    expect(getFinalizeFailureCount('game-never-attempted')).toBe(0);
  });
});

// fetchAllRows is the exact I/O boundary where a truncated/failed Supabase
// response either does or does not get read as "these rows don't exist"
// (round-1 review, Critical 1 and Important 3; round-2 review, N1 and N3).
// Unlike reconcileGameLifecycle, it needs no WatermelonDB/Supabase harness —
// its signature is `(label, pageFactory: (cursor, limit) =>
// PromiseLike<{data, error}>, getCursor)`, so a bare `jest.fn()` stub is
// enough to exercise every branch directly against `database = {}`.
const byId = (row: Record<string, unknown>) => row.id as string;

describe('fetchAllRows', () => {
  it('returns ok:false when the page factory throws', async () => {
    const pageFactory = jest.fn().mockRejectedValue(new Error('network down'));
    expect(await fetchAllRows('test-table', pageFactory, byId)).toEqual({ ok: false });
  });

  it('returns ok:false when the response carries a Postgrest error', async () => {
    const pageFactory = jest.fn().mockResolvedValue({ data: null, error: { message: 'boom' } });
    expect(await fetchAllRows('test-table', pageFactory, byId)).toEqual({ ok: false });
  });

  it('returns ok:false when data is null with no error — must not read as "confirmed empty"', async () => {
    // This is the exact shape a truncated/malformed response can take without
    // tripping the `error` check — `{ data: null, error: null }`. Round-1
    // review, Important 3: `?? []` previously turned this into "zero rows",
    // which deletes every synced local row for the table.
    const pageFactory = jest.fn().mockResolvedValue({ data: null, error: null });
    expect(await fetchAllRows('test-table', pageFactory, byId)).toEqual({ ok: false });
  });

  it('returns ok:true with an empty row list for a genuinely empty, successful response', async () => {
    const pageFactory = jest.fn().mockResolvedValue({ data: [], error: null });
    expect(await fetchAllRows('test-table', pageFactory, byId)).toEqual({ ok: true, rows: [] });
  });

  it('pages via keyset cursor and stops only at an empty page (round-2 N1 + N3)', async () => {
    // Exercises both fixes at once: a table larger than one page must not
    // silently truncate, AND a page shorter than pageSize (page1, 2 of 3)
    // must NOT be treated as the terminal page — only a genuinely empty page
    // (page2) ends the loop. This is the N3 fix directly: with the old
    // short-page termination, page1 alone would have stopped the loop.
    const page0 = Array.from({ length: 3 }, (_, i) => ({ id: `id-${i}` }));
    const page1 = [{ id: 'id-3' }, { id: 'id-4' }]; // short, but NOT terminal
    const page2: Array<{ id: string }> = []; // empty — this is what terminates
    const pageFactory = jest
      .fn()
      .mockResolvedValueOnce({ data: page0, error: null })
      .mockResolvedValueOnce({ data: page1, error: null })
      .mockResolvedValueOnce({ data: page2, error: null });

    const result = await fetchAllRows('test-table', pageFactory, byId, 3);

    expect(result).toEqual({ ok: true, rows: [...page0, ...page1] });
    expect(pageFactory).toHaveBeenCalledTimes(3);
    // First call has no cursor; each subsequent call's cursor is the id of
    // the LAST row of the previous page — the keyset fix (N1). This is what
    // makes it immune to a row being deleted before the cursor: the next
    // page is defined by "id greater than the last one we saw," never by a
    // row count/offset that a concurrent delete could shift.
    expect(pageFactory).toHaveBeenNthCalledWith(1, null, 3);
    expect(pageFactory).toHaveBeenNthCalledWith(2, 'id-2', 3);
    expect(pageFactory).toHaveBeenNthCalledWith(3, 'id-4', 3);
  });

  it('does not stop at a page exactly the size of pageSize — keeps fetching until empty', async () => {
    // Pins the N3 invariant directly: a full page (length === pageSize) must
    // NOT be assumed to be the last page just because it isn't short. If
    // pageSize happened to equal a lower server-side cap, an old
    // short-page-terminates implementation would stop here and silently
    // reintroduce Critical 1.
    const fullPage = Array.from({ length: 3 }, (_, i) => ({ id: `id-${i}` }));
    const pageFactory = jest
      .fn()
      .mockResolvedValueOnce({ data: fullPage, error: null })
      .mockResolvedValueOnce({ data: [], error: null });

    const result = await fetchAllRows('test-table', pageFactory, byId, 3);

    expect(result).toEqual({ ok: true, rows: fullPage });
    expect(pageFactory).toHaveBeenCalledTimes(2);
  });

  it('trips the circuit breaker and returns ok:false if a page never comes back empty', async () => {
    // Defensive ceiling against an infinite loop (e.g. a paginated query that
    // never actually advances). pageSize=1 keeps this test fast while still
    // exercising the real MAX_ID_FETCH_PAGES constant end to end.
    const pageFactory = jest.fn().mockResolvedValue({ data: [{ id: 'x' }], error: null });
    const result = await fetchAllRows('test-table', pageFactory, byId, 1);
    expect(result).toEqual({ ok: false });
  });
});

describe('shouldReconcileDeletions', () => {
  it('is false when the interval has not elapsed', () => {
    expect(shouldReconcileDeletions(1_000, 0, 2_000)).toBe(false);
  });

  it('is true exactly at the interval boundary (inclusive)', () => {
    expect(shouldReconcileDeletions(2_000, 0, 2_000)).toBe(true);
  });

  it('is true once the interval has elapsed', () => {
    expect(shouldReconcileDeletions(5_000, 0, 2_000)).toBe(true);
  });

  it('is true on the very first call (lastRunAt = 0, now > 0)', () => {
    expect(shouldReconcileDeletions(Date.now(), 0)).toBe(true);
  });
});
