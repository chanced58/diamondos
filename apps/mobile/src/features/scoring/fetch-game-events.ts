import { Q } from '@nozbe/watermelondb';
import type { GameEvent as SharedGameEvent } from '@baseball/shared';

/**
 * The subset of a WatermelonDB `game_events` row that `mapWdbGameEventToShared`
 * reads. Matches the public fields on `apps/mobile/src/db/models/GameEvent.ts`
 * (plus `id`, which every WatermelonDB `Model` provides) — a real `GameEvent`
 * model instance satisfies this structurally, and so does a plain object built
 * by a test.
 */
export interface WdbGameEventRow {
  id: string;
  remoteId: string;
  gameRemoteId: string;
  sequenceNumber: number;
  eventType: string;
  inning: number;
  isTopOfInning: boolean;
  payload: unknown;
  occurredAt: number;
  createdBy: string;
  deviceId: string;
}

/**
 * Structural subset of a WatermelonDB `Collection<GameEvent>` — just the
 * `query(...).fetch()` surface `fetchGameEventsForGame` calls. A real
 * `database.get<GameEvent>('game_events')` satisfies this directly; tests can
 * pass a fake instead of standing up WatermelonDB.
 */
export interface GameEventsCollection {
  query(...clauses: unknown[]): { fetch(): Promise<WdbGameEventRow[]> };
}

/**
 * Maps one WatermelonDB `game_events` row to the shared `GameEvent` shape
 * that `deriveGameState`, `voidEvent`'s cascade, and every other pure
 * `@baseball/shared` consumer expect. This is the exact mapping
 * `use-game-state.ts`'s live subscription and score.tsx's `voidEvent`
 * wrapper both need — pulled out here as its own named, directly-testable
 * step rather than an inline `.map()` literal, because a wrong or missing
 * field here means a downstream cascade (or `deriveGameState`) silently
 * receives a malformed event and voids (or replays) the wrong thing, or
 * nothing at all.
 */
export function mapWdbGameEventToShared(e: WdbGameEventRow): SharedGameEvent {
  return {
    id: e.remoteId || e.id,
    gameId: e.gameRemoteId,
    sequenceNumber: e.sequenceNumber,
    eventType: e.eventType as SharedGameEvent['eventType'],
    inning: e.inning,
    isTopOfInning: e.isTopOfInning,
    payload: e.payload as SharedGameEvent['payload'],
    occurredAt: new Date(e.occurredAt).toISOString(),
    createdBy: e.createdBy,
    deviceId: e.deviceId,
  };
}

/**
 * Queries the full event history for one game — no trailing window, unlike
 * `handleUndo`'s bounded `UNDO_WINDOW` fetch in score.tsx — and maps every
 * row through `mapWdbGameEventToShared`. A coach can void a play from many
 * innings back via the play feed, so the target (and any linked children it
 * cascades to) may sit far from the tail of the log; this must see the whole
 * game, not a window.
 *
 * This is the exact query-and-map step score.tsx's `voidEvent` wrapper runs
 * against the real `game_events` collection before handing the result to the
 * pure `voidEvent` cascade in `void-event.ts`. Extracted here — instead of
 * staying inlined in the component — so it is exercisable against a fake
 * `GameEventsCollection` in tests, per the same pattern `in-play-pitch.ts`,
 * `void-event.ts`, and `lineup-wizard.ts` already use for score.tsx logic.
 */
export async function fetchGameEventsForGame(
  eventsCollection: GameEventsCollection,
  gameId: string,
): Promise<SharedGameEvent[]> {
  const rows = await eventsCollection
    .query(Q.where('game_remote_id', gameId), Q.sortBy('sequence_number', Q.asc))
    .fetch();
  return rows.map(mapWdbGameEventToShared);
}
