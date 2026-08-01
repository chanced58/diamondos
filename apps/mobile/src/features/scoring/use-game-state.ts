import { useEffect, useState } from 'react';
import { Q } from '@nozbe/watermelondb';
import { database } from '../../db';
import type { GameEvent } from '../../db/models/GameEvent';
import {
  computeLineScore,
  deriveGameState,
  filterResetAndReverted,
  filterVoidedAndRevertedEvents,
} from '@baseball/shared';
import type { LineScoreData, LiveGameState } from '@baseball/shared';
import type { GameEvent as SharedGameEvent } from '@baseball/shared';

/**
 * Reactively derives live game state from WatermelonDB game events.
 * Subscribes to the game_events table for this game and recomputes
 * state whenever a new event is added (offline or synced).
 *
 * Also returns the line score (inning-by-inning runs/hits/errors) so
 * league-rule advisories (mercy, run cap, regulation complete) can be
 * evaluated without an extra query, plus the void/revert-filtered shared
 * events so callers (due-batter derivation) can reuse the mapped stream
 * without a second query.
 */
export function useGameState(gameRemoteId: string, homeTeamId: string) {
  const [gameState, setGameState] = useState<LiveGameState | null>(null);
  const [lineScore, setLineScore] = useState<LineScoreData | null>(null);
  const [events, setEvents] = useState<SharedGameEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const eventsCollection = database.get<GameEvent>('game_events');

    const subscription = eventsCollection
      .query(Q.where('game_remote_id', gameRemoteId), Q.sortBy('sequence_number', Q.asc))
      .observe()
      .subscribe((events) => {
        // Map WDB models to shared GameEvent types for the pure deriveGameState function
        const sharedEvents: SharedGameEvent[] = events.map((e) => ({
          id: e.remoteId || e.id,
          gameId: e.gameRemoteId,
          sequenceNumber: e.sequenceNumber,
          eventType: e.eventType as SharedGameEvent['eventType'],
          inning: e.inning,
          isTopOfInning: e.isTopOfInning,
          payload: e.payload,
          occurredAt: new Date(e.occurredAt).toISOString(),
          createdBy: e.createdBy,
          deviceId: e.deviceId,
        }));

        // deriveGameState filters corrections internally (idempotently);
        // filter here too so the exposed events match what was replayed.
        const activeEvents = filterVoidedAndRevertedEvents(sharedEvents);
        const state = deriveGameState(gameRemoteId, activeEvents, homeTeamId);
        setGameState(state);
        setEvents(activeEvents);

        // computeLineScore expects snake_case rows (it's a database-row adapter
        // shared with the web client). Re-map the WDB models, then strip out
        // any events that were voided via the undo flow (EVENT_VOIDED) so the
        // line score stays consistent with `gameState`.
        const lineScoreRows = filterResetAndReverted(
          events.map((e) => ({
            // id lets filterResetAndReverted match EVENT_VOIDED by
            // voidedEventId; sequence_number is the fallback the filter uses
            // when a row carries no id.
            id: e.remoteId || e.id,
            event_type: e.eventType,
            inning: e.inning,
            is_top_of_inning: e.isTopOfInning,
            payload: e.payload,
            sequence_number: e.sequenceNumber,
          })),
        );
        setLineScore(computeLineScore(lineScoreRows));
        setLoading(false);
      });

    return () => subscription.unsubscribe();
  }, [gameRemoteId, homeTeamId]);

  return { gameState, lineScore, events, loading };
}
