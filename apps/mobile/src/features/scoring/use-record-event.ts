import { randomUUID } from 'expo-crypto';
import { database } from '../../db';
import type { GameEvent } from '../../db/models/GameEvent';
import { getDeviceId } from '../../lib/device-id';
import { getSupabaseClient } from '../../lib/supabase';
import { useSyncContext } from '../../providers/SyncProvider';
import type { EventType, GameEventPayload } from '@baseball/shared';
import { readNextSequenceNumber } from './sequence-number';

/**
 * Returns a recordEvent function that:
 *   1. Writes the event to WatermelonDB immediately (offline-safe)
 *   2. Assigns the next sequence number inside the same write, so it cannot
 *      race another event being recorded at the same moment
 *   3. Triggers a background sync to Supabase
 */
export function useRecordEvent(gameRemoteId: string) {
  const { triggerSync } = useSyncContext();
  const supabase = getSupabaseClient();

  async function recordEvent(
    eventType: EventType,
    inning: number,
    isTopOfInning: boolean,
    payload: GameEventPayload,
  ): Promise<string> {
    // getSession() reads the persisted session from local storage;
    // getUser() would round-trip to /auth/v1/user to validate the token,
    // which fails with no connectivity — and this is the offline-first write
    // path. A scorer at a field with no signal must still be able to record
    // the game; the events sync later. Only the locally-stored user id is
    // needed here, so there is nothing to validate against the server.
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    if (!userId) throw new Error('Not authenticated');

    const deviceId = await getDeviceId();
    const eventsCollection = database.get<GameEvent>('game_events');
    const eventId = randomUUID();

    await database.write(async () => {
      // Inside the write: WatermelonDB serialises writers, so two events
      // recorded back to back (the in-play wrapper's PITCH_THROWN and its
      // terminal event, say) each see the row the other just created.
      const sequenceNumber = await readNextSequenceNumber(eventsCollection, gameRemoteId);

      // Assign the DECORATED (camelCase) properties, not raw column names.
      // WatermelonDB's create() hands back a Model, whose @field decorators
      // are what write through to _raw. Setting snake_case column names here
      // just attaches inert JS properties that are silently discarded — and
      // `payload` in particular collides with GameEvent's getter-only
      // `payload`, so the column stayed empty and every pushed event failed
      // to parse. The raw column name for the JSON blob is `payload`; the
      // model exposes it as `payloadRaw`.
      await eventsCollection.create((record: GameEvent) => {
        // Keep the WDB id equal to the client UUID that becomes the server
        // PK, so the post-push echo pull merges by id instead of inserting a
        // duplicate (same invariant as prepareLineupRow).
        record._raw.id = eventId;
        record.remoteId = eventId;
        record.gameRemoteId = gameRemoteId;
        record.sequenceNumber = sequenceNumber;
        record.eventType = eventType;
        record.inning = inning;
        record.isTopOfInning = isTopOfInning;
        record.payloadRaw = JSON.stringify(payload);
        record.occurredAt = Date.now();
        record.createdBy = userId;
        record.deviceId = deviceId;
        record.syncedAt = undefined;
      });
    });

    // Trigger sync in the background (non-blocking)
    triggerSync().catch(console.warn);

    // Return the persisted event id so the caller can chain follow-up
    // events that link back via `relatedEventId` (used by the runner-
    // outcomes flow to attach BASERUNNER_OUT / BASERUNNER_ADVANCE events
    // to their parent HIT).
    return eventId;
  }

  return { recordEvent };
}
