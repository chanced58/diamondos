/**
 * Pure decision logic for syncing offline-edited game lineups from a mobile
 * device back to the server.
 *
 * Conflict policy (per product decision):
 *  - While a game is in progress, the scorekeeper's device is authoritative —
 *    its lineup replaces whatever is on the server ("mobile wins live").
 *  - Before first pitch (and after completion), last write wins by timestamp,
 *    with ties favoring the device so an offline edit made at the same instant
 *    as the server's is not silently dropped.
 */

export type LineupPushDecision = 'push' | 'skip';

export interface LineupPushInput {
  /** Server-side games.status at push time (e.g. 'scheduled', 'in_progress'). */
  gameStatus: string;
  /**
   * Max game_lineups.updated_at on the server for this game, in Unix ms.
   * null when the server has no lineup rows for the game.
   */
  serverMaxUpdatedAtMs: number | null;
  /** Max local updated_at across the device's rows for this game, in Unix ms. */
  localEditedAtMs: number;
}

/**
 * Decide whether the device should replace the server's lineup for one game
 * ('push') or defer to the server version ('skip').
 */
export function decideLineupPush(input: LineupPushInput): LineupPushDecision {
  if (input.gameStatus === 'in_progress') return 'push';
  if (input.serverMaxUpdatedAtMs === null) return 'push';
  return input.localEditedAtMs >= input.serverMaxUpdatedAtMs ? 'push' : 'skip';
}

/**
 * Given the full set of server row ids for a game and the ids the device has
 * already synced locally, return the local ids that no longer exist on the
 * server — i.e. rows removed by a web delete-and-reinsert save. Postgres keeps
 * no tombstones, so pull-side deletion must be derived from set difference.
 */
export function computeLineupDeletes(
  serverIds: readonly string[],
  localSyncedIds: readonly string[],
): string[] {
  const server = new Set(serverIds);
  return localSyncedIds.filter((id) => !server.has(id));
}

/**
 * How many batting slots a lineup builder should offer: at least the standard
 * 9, up to the roster size, hard-capped by the league's max batting order.
 */
export function getLineupSlotCap(rosterSize: number, maxBatters: number): number {
  return Math.min(Math.max(rosterSize, 9), maxBatters);
}

export interface LineupOrderRow {
  id: string;
  battingOrder: number | null;
  /** True for rows with unsynced local edits; dirty rows yield in collisions. */
  isDirty: boolean;
  /** Local edit timestamp (Unix ms) — later edits move first in a collision. */
  updatedAtMs: number;
}

/**
 * Resolve duplicate batting orders in a device's row set before a
 * whole-lineup replace push. Server-synced rows keep their slots (they can't
 * collide with each other — the DB constraint forbids it); dirty rows that
 * collide are renumbered to the end of the order, oldest edit first, or
 * benched (null) when past the cap. Returns adjustments for changed rows only.
 *
 * This is a backstop: UI validation should prevent duplicates, but a stale
 * local mirror (e.g. Add Batter before the first lineup pull) can still
 * produce them, and an insert that violates unique(game_id, batting_order)
 * after the delete half of the replace would leave the server lineup empty.
 */
export function resolveBattingOrderCollisions(
  rows: readonly LineupOrderRow[],
  maxBatters: number,
): Map<string, number | null> {
  const adjustments = new Map<string, number | null>();
  const taken = new Set<number>();
  for (const row of rows) {
    if (!row.isDirty && row.battingOrder !== null) taken.add(row.battingOrder);
  }

  const dirtyRows = rows
    .filter((row) => row.isDirty && row.battingOrder !== null)
    .sort((a, b) => a.updatedAtMs - b.updatedAtMs);

  for (const row of dirtyRows) {
    const order = row.battingOrder as number;
    if (!taken.has(order)) {
      taken.add(order);
      continue;
    }
    const next = taken.size > 0 ? Math.max(...taken) + 1 : 1;
    if (next > maxBatters) {
      adjustments.set(row.id, null);
    } else {
      adjustments.set(row.id, next);
      taken.add(next);
    }
  }
  return adjustments;
}
