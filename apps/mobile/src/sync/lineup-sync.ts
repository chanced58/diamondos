import { Q } from '@nozbe/watermelondb';
import { decideLineupPush, resolveBattingOrderCollisions } from '@baseball/shared';
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

// The DB check constraint caps batting_order at 30 regardless of league
// settings; the collision renumberer must never exceed it.
const DB_BATTING_ORDER_CAP = 30;

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
 * Two safety guards beyond the LWW/mobile-wins decision:
 *  - Never-hydrated guard: if the server has rows but this device has never
 *    pulled any of them (no synced local rows), a replace would blow away a
 *    lineup the device has never seen — e.g. Add Batter used offline right
 *    after install. Skip instead; the snapshot fallback hydrates the mirror
 *    (preserving the dirty rows) and the next cycle pushes the merged set.
 *  - Collision renumbering: duplicate batting orders in the local set would
 *    fail the insert AFTER the delete committed, leaving the server lineup
 *    empty and the push poisoned. Dirty rows lose their slot and move to the
 *    end of the order (see resolveBattingOrderCollisions).
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
    supabase.from('games').select('status').eq('id', gameRemoteId).maybeSingle(),
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

  // Game gone from the server (deleted on web, or hidden from this user).
  // Treat as server-wins: the snapshot fallback will clear the local rows.
  if (!gameResult.data) return 'skipped';

  const serverMaxUpdatedAtMs = serverMaxResult.data
    ? new Date(serverMaxResult.data.updated_at).getTime()
    : null;

  // The device's full current row set — not just the changed rows — because
  // the push replaces the game's entire lineup. Soft-deleted rows are
  // correctly absent from this query, which is how removals propagate.
  const localRows = await database
    .get<GameLineup>('game_lineups')
    .query(Q.where('game_remote_id', gameRemoteId))
    .fetch();

  const hasHydratedRows = localRows.some((row) => row.syncStatus === 'synced');
  if (serverMaxUpdatedAtMs !== null && !hasHydratedRows) return 'skipped';

  const decision = decideLineupPush({
    gameStatus: gameResult.data.status,
    serverMaxUpdatedAtMs,
    localEditedAtMs,
  });
  if (decision === 'skip') return 'skipped';

  const adjustments = resolveBattingOrderCollisions(
    localRows.map((row) => ({
      id: row.id,
      battingOrder: row.battingOrder ?? null,
      isDirty: row.syncStatus !== 'synced',
      updatedAtMs: row.updatedAt,
    })),
    DB_BATTING_ORDER_CAP,
  );
  if (adjustments.size > 0) {
    // Persist the renumbering locally so the mirror matches what we insert.
    await database.write(async () => {
      for (const row of localRows) {
        if (!adjustments.has(row.id)) continue;
        await row.update((r) => {
          r.battingOrder = adjustments.get(row.id) ?? undefined;
        });
      }
    });
  }

  const { error: deleteError } = await supabase
    .from('game_lineups')
    .delete()
    .eq('game_id', gameRemoteId);
  if (deleteError) throw deleteError;

  if (localRows.length > 0) {
    const { error: insertError } = await supabase.from('game_lineups').insert(
      localRows.map((row) => {
        const battingOrder = adjustments.has(row.id)
          ? adjustments.get(row.id)
          : row.battingOrder ?? null;
        return {
          id: row.remoteId,
          game_id: row.gameRemoteId,
          player_id: row.playerRemoteId,
          batting_order: battingOrder ?? null,
          // Cast: local column is a plain string; server validates the enum.
          starting_position: (row.startingPosition ?? null) as never,
          is_starter: row.isStarter,
          is_guest: row.isGuest,
          guest_display_name: row.guestDisplayName ?? null,
          count_toward_stats: row.countTowardStats,
        };
      }),
    );
    if (insertError) throw insertError;
  }
  return 'pushed';
}

/**
 * Converge a skipped (server-wins) game: replace the device's synced rows
 * with the server's while PRESERVING locally-dirty rows (unsynced edits made
 * mid-cycle, or rows the never-hydrated guard deferred) — those push on the
 * next cycle against the now-hydrated mirror. Applied rows are stamped
 * _status='synced' directly so this hydration never echoes back to the
 * server as a fresh local edit.
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
      if (serverIds.has(row.id)) continue;
      if (row.syncStatus !== 'synced') continue; // dirty mid-cycle edit — keep
      if (row.syncedAt == null) {
        // Device-authored row the cycle marked "synced" without it ever
        // reaching the server (the never-hydrated guard deferred its game's
        // push). Re-mark it dirty so the next cycle pushes the merged set.
        batch.push(
          row.prepareUpdate((r) => {
            r._raw._status = 'created';
          }),
        );
        continue;
      }
      batch.push(row.prepareDestroyPermanently());
    }
    for (const server of serverRows ?? []) {
      const existing = localById.get(server.id);
      if (existing && existing.syncStatus !== 'synced') continue; // keep local edit
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
        // Raw escape hatch: mark the row clean so hydration doesn't get
        // pushed back to the server as if the coach had edited it.
        r._raw._status = 'synced';
        r._raw._changed = '';
      };
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
