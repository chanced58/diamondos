import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * At most PostgREST's `db-max-rows` (1000 on Supabase Cloud): a larger page
 * would be cut short silently.
 */
const PAGE_SIZE = 1000;

/**
 * Far past any single game's log; a log still full at this many pages is
 * reported as an error rather than returned partly.
 */
const MAX_PAGES = 20;

/**
 * One game's whole `game_events` log in sequence order, read in keyset pages
 * so a long game (extra innings, many corrections) is never truncated at the
 * row cap — a cut-off log would replay to a stale score.
 */
export async function fetchGameEventLog(
  db: SupabaseClient,
  gameId: string,
  pageSize: number = PAGE_SIZE,
): Promise<{ data: Record<string, unknown>[]; error: null } | { data: null; error: { message: string } }> {
  const rows: Record<string, unknown>[] = [];
  let after = -1;

  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await db
      .from('game_events')
      .select('*')
      .eq('game_id', gameId)
      .gt('sequence_number', after)
      .order('sequence_number')
      .limit(pageSize);
    if (error) return { data: null, error };

    const batch = (data ?? []) as Record<string, unknown>[];
    rows.push(...batch);
    if (batch.length < pageSize) return { data: rows, error: null };
    after = batch[batch.length - 1].sequence_number as number;
  }

  return { data: null, error: { message: `game ${gameId} has more than ${MAX_PAGES * pageSize} events` } };
}
