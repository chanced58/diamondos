/**
 * Messages are soft-deleted on the server (`deleted_at` set, body blanked —
 * the web's and the app's delete), never hard-deleted on their own, and the
 * table has no `updated_at`: the incremental pull, which reads messages by
 * `created_at`, would never see an older message's deletion, and a message
 * created and deleted within one window would arrive as an empty bubble.
 *
 * So each pull also reads the ids of messages deleted since the last pull
 * (`deleted_at >= since` — the same window, so no unbounded id fetch), and
 * this splits the pulled rows: live ones are written, deleted ones — pulled
 * with `deleted_at` set, deleted since, or cascaded from a deleted channel —
 * are removed from the device.
 */

type MessageRow = Record<string, unknown>;

/**
 * How far before the checkpoint the deleted-ids read starts. `deleted_at` is
 * stamped by the web server's clock when the delete is issued, not by the
 * database at commit, so a delete can land just behind a pull's server-clock
 * checkpoint (latency, or a lagging web clock) and would otherwise be skipped
 * for good. Re-reading ids is harmless: the split is set-based.
 */
export const DELETED_MESSAGES_OVERLAP_MS = 5 * 60 * 1000;

/** The lower bound for the deleted-ids read: `since`, less the overlap. */
export function deletedMessagesSince(since: string): string {
  return new Date(Math.max(0, Date.parse(since) - DELETED_MESSAGES_OVERLAP_MS)).toISOString();
}

export function splitDeletedMessages(
  pulledRows: readonly MessageRow[],
  deletedSinceIds: readonly string[],
  cascadeDeletedIds: readonly string[],
): { live: MessageRow[]; deletedIds: string[] } {
  const deleted = new Set<string>([...cascadeDeletedIds, ...deletedSinceIds]);
  for (const row of pulledRows) {
    if (row.deleted_at != null) deleted.add(row.id as string);
  }
  return {
    live: pulledRows.filter((row) => !deleted.has(row.id as string)),
    deletedIds: [...deleted],
  };
}
