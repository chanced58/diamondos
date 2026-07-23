import { useRef } from 'react';
const randomUUID = () => crypto.randomUUID();
import { Q } from '@nozbe/watermelondb';
import { database } from '../../db';
import type { GameEvent } from '../../db/models/GameEvent';
import { getDeviceId } from '../../lib/device-id';
import { getSupabaseClient } from '../../lib/supabase';
import { useSyncContext } from '../../providers/SyncProvider';
import type { EventType, GameEventPayload } from '@baseball/shared';

/**
 * Returns a recordEvent function that:
 *   1. Writes the event to WatermelonDB immediately (offline-safe)
 *   2. Assigns the next sequence number atomically
 *   3. Triggers a background sync to Supabase
 */
export function useRecordEvent(gameRemoteId: string) {
  const sequenceRef = useRef<number | null>(null);
  const { triggerSync } = useSyncContext();
  const supabase = getSupabaseClient();

  async function recordEvent(
    eventType: EventType,
    inning: number,
    isTopOfInning: boolean,
    payload: GameEventPayload,
  ): Promise<string> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const deviceId = await getDeviceId();
    const eventsCollection = database.get<GameEvent>('game_events');

    // Derive next sequence number from the highest existing one
    // This is safe for single-device use; conflicts are handled server-side
    if (sequenceRef.current === null) {
      const existingEvents = await eventsCollection
        .query(
          Q.where('game_remote_id', gameRemoteId),
          Q.sortBy('sequence_number', Q.desc),
        )
        .fetch();
      sequenceRef.current = existingEvents.length > 0
        ? existingEvents[0].sequenceNumber
        : 0;
    }

    sequenceRef.current += 1;
    const sequenceNumber = sequenceRef.current;

    const eventId = randomUUID();

    await database.write(async () => {
      await eventsCollection.create((record) => {
        // The WDB internal id must equal the client-generated UUID that
        // becomes the server PK (same convention as local-guest.ts). Without
        // this, the post-push pull re-fetches this same event under its
        // server id, doesn't recognize it as the record we already have, and
        // inserts a second local copy — silently double-counting every pitch.
        record._raw.id = eventId;
        record.remoteId = eventId;
        record.gameRemoteId = gameRemoteId;
        record.sequenceNumber = sequenceNumber;
        record.eventType = eventType;
        record.inning = inning;
        record.isTopOfInning = isTopOfInning;
        record.payloadRaw = JSON.stringify(payload);
        record.occurredAt = Date.now();
        record.createdBy = user.id;
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
