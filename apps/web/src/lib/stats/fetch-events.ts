import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Page size for the game_events fetch. Must be ≤ Supabase's PostgREST
 * `db-max-rows` (default 1000 on Supabase Cloud), otherwise the server
 * silently truncates each page and we still under-fetch. 1000 is the
 * maximum that fits in a single round-trip.
 */
const PAGE_SIZE = 1000;

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
 * Throws on any Supabase error so the caller's page fails loudly instead
 * of rendering partial data with no signal.
 */
export async function fetchAllEventsForGames(
  db: SupabaseClient,
  gameIds: string[],
  eventTypes: readonly string[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any[]> {
  if (gameIds.length === 0) return [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const all: any[] = [];
  let from = 0;

  // Hard upper bound on iterations to prevent runaway loops if the DB ever
  // returns the same page repeatedly. 50 pages × 1000 rows = 50k events,
  // well above any single-team season's plausible volume.
  for (let iter = 0; iter < 50; iter++) {
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

    const rows = data ?? [];
    if (rows.length === 0) break;
    all.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return all;
}
