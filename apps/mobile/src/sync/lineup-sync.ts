import { Q } from '@nozbe/watermelondb';
import { decideLineupPush } from '@baseball/shared';
import type { Database } from '@nozbe/watermelondb';
import type { GameLineup } from '../db/models/GameLineup';
import type { getSupabaseClient } from '../lib/supabase';

type SupabaseClient = ReturnType<typeof getSupabaseClient>;

/**
 * game_lineups sync helpers.
 *
 * Unlike game_events (immutable, append-only), lineups are mutable, so the
 * push is a per-game whole-lineup replace guarded by decideLineupPush from
 * @baseball/shared: the device wins while the game is in progress; otherwise
 * last write wins by timestamp. Skipped (server-wins) games are converged
 * after the sync cycle by applyServerLineupSnapshot.
 */

export interface DirtyLineupState {
  /** Games whose local lineup has unsynced creates/updates/deletes. */
  dirtyGameIds: Set<string>;
  /** Per dirty game: max local updated_at (Unix ms) across its dirty rows. */
  localEditedAtMsByGame: Map<string, number>;
}

/**
 * Collect the games with unsynced local lineup changes. Uses raw SQL because
 * normal WatermelonDB queries hide soft-deleted rows (_status='deleted'), and
 * a removed lineup slot must still mark its game dirty so the deletion is
 * pushed as part of the replace.
 */
export async function getDirtyLineupState(database: Database): Promise<DirtyLineupState> {
  const rows = (await database
    .get<GameLineup>('game_lineups')
    .query(
      Q.unsafeSqlQuery(
        "select game_remote_id, updated_at from game_lineups where _status is not 'synced'",
      ),
    )
    .unsafeFetchRaw()) as Array<{ game_remote_id: string; updated_at: number }>;

  const dirtyGameIds = new Set<string>();
  const localEditedAtMsByGame = new Map<string, number>();
  for (const row of rows) {
    dirtyGameIds.add(row.game_remote_id);
    const prev = localEditedAtMsByGame.get(row.game_remote_id) ?? 0;
    localEditedAtMsByGame.set(row.game_remote_id, Math.max(prev, row.updated_at ?? 0));
  }
  return { dirtyGameIds, localEditedAtMsByGame };
}

/**
 * Push one game's lineup to the server as a whole-lineup replace, or skip if
 * the conflict policy says the server version wins. Throws on any server
 * error so WatermelonDB keeps the local rows unsynced and retries next cycle
 * (a 23505 here means a concurrent web save raced our delete+insert).
 *
 * Returns 'pushed' or 'skipped'.
 */
export async function pushLineupsForGame(
  supabase: SupabaseClient,
  database: Database,
  gameRemoteId: string,
  localEditedAtMs: number,
): Promise<'pushed' | 'skipped'> {
  const [gameResult, serverMaxResult] = await Promise.all([
    supabase.from('games').select('status').eq('id', gameRemoteId).single(),
    supabase
      .from('game_lineups')
      .select('updated_at')
      .eq('game_id', gameRemoteId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (gameResult.error) throw gameResult.error;
  if (serverMaxResult.error) throw serverMaxResult.error;

  const decision = decideLineupPush({
    gameStatus: gameResult.data.status,
    serverMaxUpdatedAtMs: serverMaxResult.data
      ? new Date(serverMaxResult.data.updated_at).getTime()
      : null,
    localEditedAtMs,
  });
  if (decision === 'skip') return 'skipped';

  // The device's full current row set — not just the changed rows — because
  // the push replaces the game's entire lineup. Soft-deleted rows are
  // correctly absent from this query, which is how removals propagate.
  const localRows = await database
    .get<GameLineup>('game_lineups')
    .query(Q.where('game_remote_id', gameRemoteId))
    .fetch();

  const { error: deleteError } = await supabase
    .from('game_lineups')
    .delete()
    .eq('game_id', gameRemoteId);
  if (deleteError) throw deleteError;

  if (localRows.length > 0) {
    const { error: insertError } = await supabase.from('game_lineups').insert(
      localRows.map((row) => ({
        id: row.remoteId,
        game_id: row.gameRemoteId,
        player_id: row.playerRemoteId,
        batting_order: row.battingOrder ?? null,
        // Cast: local column is a plain string; server validates the enum.
        starting_position: (row.startingPosition ?? null) as never,
        is_starter: row.isStarter,
        is_guest: row.isGuest,
        guest_display_name: row.guestDisplayName ?? null,
        count_toward_stats: row.countTowardStats,
      })),
    );
    if (insertError) throw insertError;
  }
  return 'pushed';
}

/**
 * Converge a skipped (server-wins) game: replace the device's local rows with
 * the server's. Runs after the sync cycle, so any soft-deleted local rows are
 * already gone and the remaining rows are marked synced. Recreated/updated
 * rows land as dirty and echo back an identical replace next cycle, which is
 * idempotent.
 */
export async function applyServerLineupSnapshot(
  database: Database,
  supabase: SupabaseClient,
  gameRemoteId: string,
): Promise<void> {
  const { data: serverRows, error } = await supabase
    .from('game_lineups')
    .select('*')
    .eq('game_id', gameRemoteId);
  if (error) throw error;

  const collection = database.get<GameLineup>('game_lineups');
  const localRows = await collection.query(Q.where('game_remote_id', gameRemoteId)).fetch();
  const localById = new Map(localRows.map((row) => [row.id, row]));
  const serverIds = new Set((serverRows ?? []).map((row) => row.id));

  await database.write(async () => {
    const batch: Array<GameLineup> = [];
    for (const row of localRows) {
      if (!serverIds.has(row.id)) batch.push(row.prepareDestroyPermanently());
    }
    for (const server of serverRows ?? []) {
      const apply = (r: GameLineup) => {
        r.remoteId = server.id;
        r.gameRemoteId = server.game_id;
        r.playerRemoteId = server.player_id;
        r.battingOrder = server.batting_order ?? undefined;
        r.startingPosition = server.starting_position ?? undefined;
        r.isStarter = server.is_starter;
        r.isGuest = server.is_guest;
        r.guestDisplayName = server.guest_display_name ?? undefined;
        r.countTowardStats = server.count_toward_stats;
        r.updatedAt = new Date(server.updated_at).getTime();
        r.syncedAt = Date.now();
      };
      const existing = localById.get(server.id);
      if (existing) {
        batch.push(existing.prepareUpdate(apply));
      } else {
        batch.push(
          collection.prepareCreate((r) => {
            r._raw.id = server.id;
            apply(r);
          }),
        );
      }
    }
    await database.batch(...batch);
  });
}
