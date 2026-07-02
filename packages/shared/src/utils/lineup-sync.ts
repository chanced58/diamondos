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
