/**
 * Pure diff logic for propagating server-side deletions to the local
 * WatermelonDB (H3 in the phase 3 audit).
 *
 * The sync engine's pulls are incremental (`gte(updated_at, since)` and
 * friends), so a row absent from a pull cannot be told apart from "unchanged
 * since last sync" and "deleted, or moved out of this device's scope". The
 * only way to know is a separate id-only fetch of the whole table (within
 * the same RLS/query scope the main pull uses), diffed against local ids —
 * the same technique `game_lineups` / `opponent_game_lineups` already use in
 * sync-engine.ts, generalized here for tables that don't need the mutable
 * row content, just the id set.
 *
 * The safety rule (do not weaken this): a local row may be deleted only if
 * it has already been synced to the server (`syncedAt != null`) AND its id
 * is absent from the server's id set. A row with `syncedAt == null` was
 * created on this device and has never been pushed — it is absent
 * server-side because it hasn't been sent yet, not because anyone deleted
 * it. Treating it as deleted would destroy a coach's unsynced offline work.
 */

export interface LocalRowForDeletion {
  id: string;
  syncedAt: number | null | undefined;
}

/**
 * Local row ids that no longer exist in `serverIds` and are safe to delete —
 * i.e. already synced at least once, so their absence means "removed
 * server-side (or moved out of scope)", not "not sent yet".
 */
export function computeDeletions(
  serverIds: Set<string>,
  localRows: LocalRowForDeletion[],
): string[] {
  return localRows
    .filter((row) => row.syncedAt != null && !serverIds.has(row.id))
    .map((row) => row.id);
}

/**
 * Wraps `computeDeletions` with the second safety rule: an id-only fetch
 * that failed (network error, RLS surprise, thrown exception — anything
 * short of a clean response) must never be read as "the server has zero
 * rows". Pass `null` for `serverIds` when the fetch failed; this reconciles
 * nothing for the table this cycle rather than deleting every synced local
 * row.
 */
export function reconcileIfFetchSucceeded(
  serverIds: Set<string> | null,
  localRows: LocalRowForDeletion[],
): string[] {
  if (serverIds === null) return [];
  return computeDeletions(serverIds, localRows);
}

export interface LocalChildRow {
  id: string;
  parentId: string;
}

/**
 * Derives deletions for an unbounded child table (game_events, messages)
 * from the parent ids already confirmed deleted this cycle, mirroring the
 * server's own FK cascade instead of id-fetching the child table directly.
 *
 * This is exact, not an approximation, for tables that are only ever
 * removed server-side via their parent's cascade (game_events is
 * append-only and has no standalone delete path; messages have no
 * standalone delete feature today — see the sync engine for that
 * limitation). No syncedAt guard is needed here: once the parent is
 * confirmed gone, every local child row referencing it — synced or not —
 * corresponds to a game/channel that no longer exists.
 */
export function computeCascadeDeletions(
  deletedParentIds: readonly string[],
  localChildRows: LocalChildRow[],
): string[] {
  if (deletedParentIds.length === 0) return [];
  const parents = new Set(deletedParentIds);
  return localChildRows.filter((row) => parents.has(row.parentId)).map((row) => row.id);
}
