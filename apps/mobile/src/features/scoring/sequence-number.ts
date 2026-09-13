import { Q } from '@nozbe/watermelondb';

/** The slice of `Collection<GameEvent>` the sequence read needs. */
export interface SequenceSource {
  query(...clauses: unknown[]): { fetch(): Promise<Array<{ sequenceNumber: number }>> };
}

/**
 * The sequence number the next event for this game should take: one above
 * the highest stored locally.
 *
 * Read fresh on every event — never cached. The sync engine's collision
 * handler (reconcileSequenceNumbers in sync-engine.ts) rewrites local rows'
 * sequence numbers to sit above the server's max, and a cached counter
 * never learns about that. It used to live in a useRef read once per mount:
 * on a fresh install the ref was seeded before the pull landed, based itself
 * near 0 while the server was at 48, and every event after that collided,
 * got renumbered, and collided again — two round trips per pitch and a
 * warning on every sync, indefinitely.
 */
export async function readNextSequenceNumber(
  events: SequenceSource,
  gameRemoteId: string,
): Promise<number> {
  const [highest] = await events
    .query(
      Q.where('game_remote_id', gameRemoteId),
      Q.sortBy('sequence_number', Q.desc),
      Q.take(1),
    )
    .fetch();
  return (highest?.sequenceNumber ?? 0) + 1;
}
