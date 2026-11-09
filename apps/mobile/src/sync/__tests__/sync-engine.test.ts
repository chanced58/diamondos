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
  reconcileGameLifecycle,
  keepLocalPlayOverWrittenResult,
  mapGame,
  mapOpponentPlayer,
  toOpponentPlayerWrite,
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

// ─── League games: written results and placeholders ─────────────────────────

const mockDatabase = jest.requireMock('../../db').database as Record<string, unknown>;

function chain(result: unknown) {
  // A thenable query builder: every filter returns itself, awaiting it (or
  // maybeSingle) yields the canned result.
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'in', 'eq']) builder[method] = () => builder;
  builder.maybeSingle = async () => result;
  builder.then = (resolve: (value: unknown) => unknown) => resolve(result);
  return builder;
}

function lifecycleHarness(serverGame: { id: string; status: string; result_source: string | null }) {
  mockDatabase.get = () => ({
    query: () => ({
      fetch: async () => [{
        eventType: 'game_end',
        remoteId: `${serverGame.id}-end`,
        gameRemoteId: serverGame.id,
        payload: { homeScore: 4, awayScore: 2 },
        inning: 7,
        isTopOfInning: false,
        deviceId: 'device-1',
      }],
    }),
  });
  mockDatabase.localStorage = { get: async () => null };
  const supabase = {
    from: (table: string) => (table === 'games'
      ? chain({ data: [serverGame], error: null })
      : chain({ data: { id: `${serverGame.id}-end` }, error: null })),
    rpc: jest.fn(async () => ({ error: null })),
    auth: { getSession: async () => ({ data: { session: { access_token: 'token' } } }) },
  };
  const fetchMock = jest.fn(async () => ({ ok: true, text: async () => '' }));
  global.fetch = fetchMock as unknown as typeof fetch;
  return { supabase, fetchMock };
}

describe('reconcileGameLifecycle', () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; });

  it('should still finalize a game whose server row was completed from the paired book', async () => {
    const { supabase, fetchMock } = lifecycleHarness({ id: 'g-paired', status: 'completed', result_source: 'paired' });

    await reconcileGameLifecycle(supabase as never, 'https://app.test');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('https://app.test/api/games/g-paired/finalize', expect.objectContaining({ method: 'POST' }));
  });

  it('should still finalize a game whose server row carries a hand-entered result', async () => {
    const { supabase, fetchMock } = lifecycleHarness({ id: 'g-manual', status: 'completed', result_source: 'manual' });

    await reconcileGameLifecycle(supabase as never, 'https://app.test');

    expect(fetchMock).toHaveBeenCalledWith('https://app.test/api/games/g-manual/finalize', expect.anything());
  });

  it('should not finalize a game the server already holds as its own finished book', async () => {
    const { supabase, fetchMock } = lifecycleHarness({ id: 'g-done', status: 'completed', result_source: null });

    await reconcileGameLifecycle(supabase as never, 'https://app.test');

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('keepLocalPlayOverWrittenResult', () => {
  const pairedResult = {
    id: 'g-1', status: 'completed', home_score: 9, away_score: 1,
    current_inning: 7, is_top_of_inning: false, outs: 3, result_source: 'paired',
  };
  const localInProgress = {
    status: 'in_progress', homeScore: 2, awayScore: 3,
    currentInning: 4, isTopOfInning: true, outs: 1, hasUnsyncedEvents: false,
  };

  it('should not overwrite a local in-progress game with a paired result', () => {
    expect(keepLocalPlayOverWrittenResult(pairedResult, localInProgress)).toEqual({
      ...pairedResult,
      status: 'in_progress', home_score: 2, away_score: 3,
      current_inning: 4, is_top_of_inning: true, outs: 1,
    });
  });

  it('should not overwrite a local game whose events have not reached the server', () => {
    const localEnded = { ...localInProgress, status: 'completed', hasUnsyncedEvents: true };
    expect(keepLocalPlayOverWrittenResult(pairedResult, localEnded)).toMatchObject({
      status: 'completed', home_score: 2, away_score: 3, current_inning: 4,
    });
  });

  it('should apply a paired result to a game this phone never scored', () => {
    const localScheduled = { ...localInProgress, status: 'scheduled', homeScore: 0, awayScore: 0 };
    expect(keepLocalPlayOverWrittenResult(pairedResult, localScheduled)).toEqual(pairedResult);
    expect(keepLocalPlayOverWrittenResult(pairedResult, undefined)).toEqual(pairedResult);
  });

  it('should apply a game the team scored itself as usual', () => {
    const ownBook = { ...pairedResult, result_source: null };
    expect(keepLocalPlayOverWrittenResult(ownBook, localInProgress)).toEqual(ownBook);
  });
});

describe('league game columns', () => {
  it('should pull which games are league games and where their result came from', () => {
    const row = mapGame({
      id: 'g-1', season_id: 's', team_id: 't', opponent_name: 'Owls', scheduled_at: '2026-11-09T18:00:00Z',
      location_type: 'home', status: 'completed', home_score: 1, away_score: 0,
      current_inning: 7, is_top_of_inning: false, outs: 3,
      league_game_id: 'lg-1', result_source: 'paired',
    }, new Map());
    expect(row).toMatchObject({ league_game_id: 'lg-1', result_source: 'paired' });
  });

  it('should pull roster links, placeholders and fill-ins for opponent players', () => {
    expect(mapOpponentPlayer({
      id: 'op-1', opponent_team_id: 'ot-1', first_name: '', last_name: '',
      linked_player_id: null, placeholder_game_id: 'lg-1', is_fill_in: true,
    })).toMatchObject({ linked_player_id: null, placeholder_game_id: 'lg-1', is_fill_in: true });
  });

  it('should push placeholder_game_id for an unknown player added during a league game', () => {
    expect(toOpponentPlayerWrite({
      remote_id: 'op-9', opponent_team_id: 'ot-1', first_name: '', last_name: '',
      jersey_number: '12', primary_position: null, is_active: true, placeholder_game_id: 'lg-1',
    })).toEqual({
      id: 'op-9', opponent_team_id: 'ot-1', first_name: '', last_name: '',
      jersey_number: '12', primary_position: null, is_active: true, placeholder_game_id: 'lg-1',
    });
  });

  it('should push a null placeholder_game_id for an ordinary opponent player', () => {
    expect(toOpponentPlayerWrite({
      remote_id: 'op-1', opponent_team_id: 'ot-1', first_name: 'Ann', last_name: 'Lee', is_active: true,
    })).toMatchObject({ placeholder_game_id: null });
  });
});
