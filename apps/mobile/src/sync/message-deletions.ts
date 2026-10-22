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
