import { useRef } from 'react';
import { randomUUID } from 'expo-crypto';
import { database } from '../../db';
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
  ) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const deviceId = await getDeviceId();
    const eventsCollection = database.get('game_events');

    // Derive next sequence number from the highest existing one
    // This is safe for single-device use; conflicts are handled server-side
    if (sequenceRef.current === null) {
      const existingEvents = await eventsCollection
        .query(
          require('@nozbe/watermelondb').Q.where('game_remote_id', gameRemoteId),
          require('@nozbe/watermelondb').Q.sortBy('sequence_number', require('@nozbe/watermelondb').Q.desc),
        )
        .fetch();
      sequenceRef.current = existingEvents.length > 0
        ? (existingEvents[0] as { sequenceNumber: number }).sequenceNumber
        : 0;
    }

    sequenceRef.current += 1;
    const sequenceNumber = sequenceRef.current;

    const eventId = randomUUID();

    await database.write(async () => {
      await eventsCollection.create((record: Record<string, unknown>) => {
        record.remote_id = eventId;
        record.game_remote_id = gameRemoteId;
        record.sequence_number = sequenceNumber;
        record.event_type = eventType;
        record.inning = inning;
        record.is_top_of_inning = isTopOfInning;
        record.payload = JSON.stringify(payload);
        record.occurred_at = Date.now();
        record.created_by = user.id;
        record.device_id = deviceId;
        record.synced_at = null;
      });
    });

    // Trigger sync in the background (non-blocking)
    triggerSync().catch(console.warn);
  }

  return { recordEvent };
}
