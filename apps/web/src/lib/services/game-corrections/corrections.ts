import type { SupabaseClient } from '@supabase/supabase-js';
import {
  insertCorrectionEventsInputSchema,
  replaceGameEventInputSchema,
  replayAtBatInputSchema,
  voidGameEventInputSchema,
} from '@baseball/shared';
import { invalidInput, serviceError, serviceOk, type ServiceResult } from '../result';
import { authorizeGameCoach } from '../games/authorize';
import { appendGameEvents } from './append-events';

/**
 * Coach corrections to a game's play-by-play. game_events is append-only, so
 * each correction appends: a void marker hides an event from replay, and a
 * new event with `insertAfterSequence` slots into its place in the log.
 * `deviceId` records where the correction came from ('web' or the phone).
 */

type Corrected = ServiceResult<{ gameId: string }>;

interface TargetEvent {
  id: string;
  sequence_number: number;
  inning: number;
  is_top_of_inning: boolean;
}

async function findEvents(db: SupabaseClient, gameId: string, eventIds: string[]): Promise<ServiceResult<TargetEvent[]>> {
  const { data, error } = await db
    .from('game_events')
    .select('id, sequence_number, inning, is_top_of_inning')
    .eq('game_id', gameId)
    .in('id', eventIds);
  if (error) {
    console.error(`[game-corrections] game=${gameId} event lookup failed:`, error);
    return serviceError('failed', 'Failed to load the event.');
  }
  const found = (data ?? []) as TargetEvent[];
  if (found.length !== new Set(eventIds).size) return serviceError('not_found', 'Event not found in this game.');
  return serviceOk(found);
}

function voidMarker(target: TargetEvent, inning = target.inning, isTopOfInning = target.is_top_of_inning) {
  return {
    event_type: 'event_voided',
    inning,
    is_top_of_inning: isTopOfInning,
    payload: { voidedEventId: target.id, voidedSequenceNumber: target.sequence_number },
  };
}

/** Delete an event: append a void marker for it. */
export async function voidGameEvent(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
  deviceId: string,
): Promise<Corrected> {
  const parsed = voidGameEventInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { gameId, eventId } = parsed.data;

  const auth = await authorizeGameCoach(db, actorUserId, gameId);
  if (!auth.ok) return auth;

  const target = await findEvents(db, gameId, [eventId]);
  if (!target.ok) return target;

  const appended = await appendGameEvents(db, { gameId, actorUserId, deviceId, events: [voidMarker(target.data[0])] });
  return appended.ok ? serviceOk({ gameId }) : appended;
}

/** Add one or more missed events, atomically; each may carry `insertAfterSequence` to place it. */
export async function insertCorrectionEvents(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
  deviceId: string,
): Promise<Corrected> {
  const parsed = insertCorrectionEventsInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { gameId, events } = parsed.data;

  const auth = await authorizeGameCoach(db, actorUserId, gameId);
  if (!auth.ok) return auth;

  const appended = await appendGameEvents(db, {
    gameId,
    actorUserId,
    deviceId,
    events: events.map((event) => ({
      event_type: event.eventType,
      inning: event.inning,
      is_top_of_inning: event.isTopOfInning,
      payload: event.payload,
    })),
  });
  return appended.ok ? serviceOk({ gameId }) : appended;
}

/** Swap an event for another: void it and put the new one in its place, in one insert. */
export async function replaceGameEvent(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
  deviceId: string,
): Promise<Corrected> {
  const parsed = replaceGameEventInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { gameId, eventId, eventType, payload } = parsed.data;

  const auth = await authorizeGameCoach(db, actorUserId, gameId);
  if (!auth.ok) return auth;

  const target = await findEvents(db, gameId, [eventId]);
  if (!target.ok) return target;
  const original = target.data[0];

  const appended = await appendGameEvents(db, {
    gameId,
    actorUserId,
    deviceId,
    events: [
      voidMarker(original),
      {
        event_type: eventType,
        inning: original.inning,
        is_top_of_inning: original.is_top_of_inning,
        payload: { ...payload, insertAfterSequence: original.sequence_number - 1 },
      },
    ],
  });
  return appended.ok ? serviceOk({ gameId }) : appended;
}

/** Re-record an at-bat: void its events and replay new ones after `insertAfterSequence`, in one insert. */
export async function replayAtBat(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
  deviceId: string,
): Promise<Corrected> {
  const parsed = replayAtBatInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { gameId, voidEventIds, newEvents, inning, isTopOfInning, insertAfterSequence } = parsed.data;

  const auth = await authorizeGameCoach(db, actorUserId, gameId);
  if (!auth.ok) return auth;

  let voids: ReturnType<typeof voidMarker>[] = [];
  if (voidEventIds.length > 0) {
    const targets = await findEvents(db, gameId, voidEventIds);
    if (!targets.ok) return targets;
    voids = targets.data.map((target) => voidMarker(target, inning, isTopOfInning));
  }

  const appended = await appendGameEvents(db, {
    gameId,
    actorUserId,
    deviceId,
    events: [
      ...voids,
      ...newEvents.map((event) => ({
        event_type: event.eventType,
        inning,
        is_top_of_inning: isTopOfInning,
        payload: { ...event.payload, insertAfterSequence },
      })),
    ],
  });
  return appended.ok ? serviceOk({ gameId }) : appended;
}
