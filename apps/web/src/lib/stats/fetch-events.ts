import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Page size for the game_events fetch. Must be ≤ Supabase's PostgREST
 * `db-max-rows` (default 1000 on Supabase Cloud), otherwise the server
 * silently truncates each page and we still under-fetch. 1000 is the
 * maximum that fits in a single round-trip.
 */
const PAGE_SIZE = 1000;

/**
 * Hard upper bound on pagination iterations. PAGE_SIZE × MAX_PAGES =
 * 50,000 events, well above any single-team season's plausible volume.
 * If the loop would terminate at this cap with a full final page (i.e.
 * more rows still exist server-side), the function throws — silently
 * returning partial data is exactly what this whole file is designed to
 * prevent.
 */
const MAX_PAGES = 50;

/**
 * Fetch every `game_events` row for the given games + event types, paging
 * through Supabase's default 1000-row limit so high-volume seasons don't
 * silently truncate. Sorted by (game_id, sequence_number) so downstream
 * derivers can rely on per-game ordering.
 *
 * Why this exists: a single `db.from('game_events').select('*').in(...)`
 * call returns at most ~1000 rows on Supabase Cloud. A team with 12+
 * scored games easily breaches that, and the silent cutoff dropped roughly
 * 80% of the events in our worst-case prod data — leaving stats panels
 * displaying ~20% of correct totals.
 *
 * Throws on any Supabase error, and on suspected MAX_PAGES truncation, so
 * the caller's page fails loudly instead of rendering partial data with
 * no signal.
 */
export async function fetchAllEventsForGames(
  db: SupabaseClient,
  gameIds: string[],
  eventTypes: readonly string[],
): Promise<Record<string, unknown>[]> {
  if (gameIds.length === 0) return [];

  const all: Record<string, unknown>[] = [];
  let from = 0;

  for (let iter = 0; iter < MAX_PAGES; iter++) {
    const { data, error } = await db
      .from('game_events')
      .select('*')
      .in('game_id', gameIds)
      .in('event_type', eventTypes as unknown as string[])
      .order('game_id')
      .order('sequence_number')
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      throw new Error(
        `[stats/fetch-events] game_events query failed at offset ${from} for ${gameIds.length} game(s): ${error.message}`,
      );
    }

    const rows = (data ?? []) as Record<string, unknown>[];
    if (rows.length === 0) break;
    // Use concat-style merge instead of .push(...rows) so an unusually large
    // page can never trip the JS engine's argument-count limit.
    Array.prototype.push.apply(all, rows);
    if (rows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;

    // Last allowed iteration — if it returned a full page, more rows still
    // exist server-side and we'd be silently truncating. Fail loudly with
    // enough context to raise the cap or split the call upstream.
    if (iter === MAX_PAGES - 1 && rows.length === PAGE_SIZE) {
      throw new Error(
        `[stats/fetch-events] hit MAX_PAGES (${MAX_PAGES}) at offset ${from} ` +
          `with a full final page of ${PAGE_SIZE} rows for ${gameIds.length} game(s); ` +
          `more events exist but would be silently dropped. Event types: ${eventTypes.join(',')}.`,
      );
    }
  }

  return all;
}
