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
// (round-1 review, Critical 1 and Important 3). Unlike reconcileGameLifecycle,
// it needs no WatermelonDB/Supabase harness — its signature is
// `(label, pageFactory: (offset, limit) => PromiseLike<{data, error}>)`, so a
// bare `jest.fn()` stub is enough to exercise every branch directly against
// `database = {}`.
describe('fetchAllRows', () => {
  it('returns ok:false when the page factory throws', async () => {
    const pageFactory = jest.fn().mockRejectedValue(new Error('network down'));
    expect(await fetchAllRows('test-table', pageFactory)).toEqual({ ok: false });
  });

  it('returns ok:false when the response carries a Postgrest error', async () => {
    const pageFactory = jest.fn().mockResolvedValue({ data: null, error: { message: 'boom' } });
    expect(await fetchAllRows('test-table', pageFactory)).toEqual({ ok: false });
  });

  it('returns ok:false when data is null with no error — must not read as "confirmed empty"', async () => {
    // This is the exact shape a truncated/malformed response can take without
    // tripping the `error` check — `{ data: null, error: null }`. Round-1
    // review, Important 3: `?? []` previously turned this into "zero rows",
    // which deletes every synced local row for the table.
    const pageFactory = jest.fn().mockResolvedValue({ data: null, error: null });
    expect(await fetchAllRows('test-table', pageFactory)).toEqual({ ok: false });
  });

  it('returns ok:true with an empty row list for a genuinely empty, successful response', async () => {
    const pageFactory = jest.fn().mockResolvedValue({ data: [], error: null });
    expect(await fetchAllRows('test-table', pageFactory)).toEqual({ ok: true, rows: [] });
  });

  it('pages through multiple full pages and stops at the first short page', async () => {
    // Exercises the Critical 1 fix directly: a table larger than one page
    // must not silently truncate at the first response.
    const page0 = Array.from({ length: 3 }, (_, i) => ({ id: `id-${i}` }));
    const page1 = Array.from({ length: 3 }, (_, i) => ({ id: `id-${i + 3}` }));
    const page2 = [{ id: 'id-6' }]; // short page — signals the end
    const pageFactory = jest
      .fn()
      .mockResolvedValueOnce({ data: page0, error: null })
      .mockResolvedValueOnce({ data: page1, error: null })
      .mockResolvedValueOnce({ data: page2, error: null });

    const result = await fetchAllRows('test-table', pageFactory, 3);

    expect(result).toEqual({ ok: true, rows: [...page0, ...page1, ...page2] });
    expect(pageFactory).toHaveBeenCalledTimes(3);
    expect(pageFactory).toHaveBeenNthCalledWith(1, 0, 3);
    expect(pageFactory).toHaveBeenNthCalledWith(2, 3, 3);
    expect(pageFactory).toHaveBeenNthCalledWith(3, 6, 3);
  });

  it('trips the circuit breaker and returns ok:false if a page never comes back short', async () => {
    // Defensive ceiling against an infinite loop (e.g. a paginated query that
    // never actually advances). pageSize=1 keeps this test fast while still
    // exercising the real MAX_ID_FETCH_PAGES constant end to end.
    const pageFactory = jest.fn().mockResolvedValue({ data: [{ id: 'x' }], error: null });
    const result = await fetchAllRows('test-table', pageFactory, 1);
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
