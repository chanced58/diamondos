import { z } from 'zod';
import { EventType } from '../types/game-event';

/**
 * Contracts for a game's play-by-play history and coach corrections
 * (`/api/m/v1/games/:gameId/history`, `…/corrections/*`), shared by the web
 * server actions and the mobile routes through
 * `apps/web/src/lib/services/game-corrections/`.
 *
 * game_events is append-only: a correction never edits a row. It appends an
 * `event_voided` marker (delete), a new event (insert, optionally placed
 * with `payload.insertAfterSequence`), or both (replace, replay at-bat).
 */

/**
 * Written only by their own flows (start, end, the void marker, the scorer's
 * undo), never as a correction. A stray revert would hide every later event.
 * `game_reset` is not an EventType, so the enum check already rejects it.
 */
const NON_CORRECTION_EVENT_TYPES: ReadonlySet<string> = new Set([
  EventType.GAME_START,
  EventType.GAME_END,
  EventType.EVENT_VOIDED,
  EventType.PITCH_REVERTED,
]);

/**
 * Flow events are neither written nor targeted by a correction: voiding a
 * start, end, void marker or revert would change how every later event replays.
 */
export function isFlowEventType(eventType: string): boolean {
  return NON_CORRECTION_EVENT_TYPES.has(eventType);
}

const MAX_PAYLOAD_CHARS = 10_000;

const gameId = z.string().uuid('Missing game ID.');
const eventId = z.string().uuid('Missing event ID.');
const inning = z.number().int().min(1, 'Invalid inning.').max(99, 'Invalid inning.');

export const correctionEventTypeSchema = z
  .nativeEnum(EventType, { errorMap: () => ({ message: 'Unknown event type.' }) })
  .refine((type) => !NON_CORRECTION_EVENT_TYPES.has(type), 'This event type cannot be added as a correction.');

export const correctionPayloadSchema = z
  .record(z.unknown())
  .refine((payload) => JSON.stringify(payload).length <= MAX_PAYLOAD_CHARS, 'Event payload is too large.');

export const voidGameEventInputSchema = z.object({ gameId, eventId });
export type VoidGameEventInput = z.input<typeof voidGameEventInputSchema>;

export const insertCorrectionEventsInputSchema = z.object({
  gameId,
  /** Appended in order, atomically. */
  events: z
    .array(
      z.object({
        eventType: correctionEventTypeSchema,
        inning,
        isTopOfInning: z.boolean(),
        payload: correctionPayloadSchema,
      }),
    )
    .min(1, 'No events to insert.')
    .max(20, 'Too many events in one correction.'),
});
export type InsertCorrectionEventsInput = z.input<typeof insertCorrectionEventsInputSchema>;

export const replaceGameEventInputSchema = z.object({
  gameId,
  eventId,
  eventType: correctionEventTypeSchema,
  payload: correctionPayloadSchema,
});
export type ReplaceGameEventInput = z.input<typeof replaceGameEventInputSchema>;

export const replayAtBatInputSchema = z
  .object({
    gameId,
    voidEventIds: z.array(eventId).max(50, 'Too many events to void.'),
    newEvents: z
      .array(z.object({ eventType: correctionEventTypeSchema, payload: correctionPayloadSchema }))
      .max(30, 'Too many events in one at-bat.'),
    inning,
    isTopOfInning: z.boolean(),
    /** The new events replay right after this sequence number. */
    insertAfterSequence: z.number().int().min(0),
  })
  .refine((input) => input.voidEventIds.length + input.newEvents.length > 0, 'Nothing to do.');
export type ReplayAtBatInput = z.input<typeof replayAtBatInputSchema>;

/** One game_events row, camelCased — the shape `GameEvent` (`@baseball/shared`) takes. */
export const historyEventSchema = z.object({
  id: z.string(),
  gameId: z.string(),
  sequenceNumber: z.number(),
  eventType: z.string(),
  inning: z.number(),
  isTopOfInning: z.boolean(),
  payload: z.record(z.unknown()),
  occurredAt: z.string(),
  createdBy: z.string().nullable(),
  deviceId: z.string().nullable(),
});
export type HistoryEvent = z.infer<typeof historyEventSchema>;

export const gameHistoryPlayerSchema = z.object({ id: z.string(), name: z.string() });

/**
 * A started game's raw log since its last reset; the client applies voids
 * and reverts and builds the tree with `applyPitchRevertedTyped` and
 * `buildGameHistoryTree`, as the web page does.
 */
export const gameHistoryResponseSchema = z.object({
  gameId: z.string(),
  status: z.enum(['in_progress', 'completed']),
  teamName: z.string(),
  opponentName: z.string(),
  weAreHome: z.boolean(),
  homeScore: z.number(),
  awayScore: z.number(),
  /** May correct the log. */
  isCoach: z.boolean(),
  events: z.array(historyEventSchema),
  /** Player id → display name, both teams. */
  playerNames: z.record(z.string()),
  teamPlayers: z.array(gameHistoryPlayerSchema),
  opponentPlayers: z.array(gameHistoryPlayerSchema),
});
export type GameHistoryResponse = z.infer<typeof gameHistoryResponseSchema>;
