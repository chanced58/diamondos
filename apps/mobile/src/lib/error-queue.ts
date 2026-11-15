import { clientErrorEntrySchema, type ClientErrorEntry } from '@baseball/shared';

/** WatermelonDB localStorage key holding error reports waiting to be sent. */
export const ERROR_QUEUE_KEY = 'errors.pending';
export const ERROR_QUEUE_MAX = 50;

/**
 * Reads the stored queue. Anything that is not a JSON array reads as empty,
 * and an entry the server would refuse is dropped on its own, so one bad
 * entry can never hold back the rest.
 */
export function parseErrorQueue(raw: unknown): ClientErrorEntry[] {
  let value: unknown = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) return [];
  const entries: ClientErrorEntry[] = [];
  for (const item of value) {
    const parsed = clientErrorEntrySchema.safeParse(item);
    if (parsed.success) entries.push(parsed.data);
  }
  return entries;
}

/** Appends an entry, keeping only the newest ERROR_QUEUE_MAX. */
export function enqueueError(queue: ClientErrorEntry[], entry: ClientErrorEntry): ClientErrorEntry[] {
  return [...queue, entry].slice(-ERROR_QUEUE_MAX);
}
