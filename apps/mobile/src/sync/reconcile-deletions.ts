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

/**
 * Blast-radius ceiling (round-1 review, Critical 2): every main pull is
 * incremental, so once a row is destroyed locally it is never re-delivered
 * until its server-side timestamp changes again — there is no self-healing.
 * A *correct* id diff can still be catastrophic if it's fed a wrong id set:
 * a transient RLS/scope flip (a coach briefly removed from a team, a bug in
 * a policy, a truncated page that slipped past the fetch-failure guard) would
 * otherwise be applied exactly like a genuine mass deletion.
 *
 * A genuine mass deletion is not urgent to apply — the brief itself says a
 * stale row lingering locally is harmless — so any candidate deletion list
 * that looks like "most of this table" is treated the same as a failed
 * fetch: skip it this cycle rather than risk applying a wrong one. This is
 * independent of, and in addition to, the syncedAt guard in
 * `computeDeletions` above.
 */
export interface BlastRadiusOptions {
  /** Deletion ratio (of locally-synced rows) above which the table is guarded. */
  fraction?: number;
  /** Absolute deletion count above which the table is guarded regardless of ratio. */
  floor?: number;
}

export interface BlastRadiusResult {
  /** The original ids, or [] if guarded. */
  ids: string[];
  /** True if this table's deletions were suppressed this cycle. */
  guarded: boolean;
  /**
   * The count that was attempted, i.e. `deletionIds.length`, preserved even
   * when `guarded` is true and `ids` is emptied — otherwise a caller logging
   * "why was this guarded" has nothing but its own already-known input to
   * report, which defeats the point of a diagnostic message.
   */
  attemptedCount: number;
}

const DEFAULT_BLAST_RADIUS_FRACTION = 0.25;
const DEFAULT_BLAST_RADIUS_FLOOR = 100;

/**
 * Suppresses a deletion list that is disproportionate to what's known
 * locally (`fraction`) or simply large in absolute terms (`floor`), either
 * of which trips the guard. `floor` exists because a fraction alone doesn't
 * protect a large table: 20% of a 10,000-row table is still 2,000 rows
 * gone. `fraction` exists because a floor alone doesn't protect a small
 * table: losing 3 of a team's 4 games is not "over the floor" but is still
 * a near-total wipe.
 */
export function applyBlastRadiusGuard(
  deletionIds: string[],
  syncedRowCount: number,
  options: BlastRadiusOptions = {},
): BlastRadiusResult {
  const fraction = options.fraction ?? DEFAULT_BLAST_RADIUS_FRACTION;
  const floor = options.floor ?? DEFAULT_BLAST_RADIUS_FLOOR;
  const count = deletionIds.length;
  if (count === 0) return { ids: [], guarded: false, attemptedCount: 0 };

  const exceedsFloor = count > floor;
  const exceedsFraction = count > fraction * syncedRowCount;
  if (exceedsFloor || exceedsFraction) {
    return { ids: [], guarded: true, attemptedCount: count };
  }
  return { ids: deletionIds, guarded: false, attemptedCount: count };
}

export type TableDeletionStatus = 'ok' | 'fetch-failed' | 'blast-radius-guarded';

export interface TableDeletionOutput {
  ids: string[];
  status: TableDeletionStatus;
  /** Rows that would have been deleted; meaningful mainly when guarded. */
  attemptedCount: number;
}

/**
 * The full per-table decision, composing both safety layers without
 * changing either: `reconcileIfFetchSucceeded` (unchanged — still the sole
 * place the `syncedAt` guard and the failed-fetch guard apply) feeding into
 * `applyBlastRadiusGuard` (new). Used identically for all five id-diffed
 * tables in sync-engine.ts so there is exactly one call site's worth of
 * "ok ? ids : null" logic to get right, not five hand-written copies.
 */
export function computeTableDeletion(
  serverIds: Set<string> | null,
  localRows: LocalRowForDeletion[],
  blastRadius: BlastRadiusOptions = {},
): TableDeletionOutput {
  if (serverIds === null) return { ids: [], status: 'fetch-failed', attemptedCount: 0 };
  const raw = reconcileIfFetchSucceeded(serverIds, localRows);
  const syncedRowCount = localRows.filter((row) => row.syncedAt != null).length;
  const guard = applyBlastRadiusGuard(raw, syncedRowCount, blastRadius);
  return {
    ids: guard.ids,
    status: guard.guarded ? 'blast-radius-guarded' : 'ok',
    attemptedCount: guard.attemptedCount,
  };
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
