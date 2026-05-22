import { useEffect, useState } from 'react';
import { Q } from '@nozbe/watermelondb';
import { database } from '../../db';
import type { GameEvent } from '../../db/models/GameEvent';
import { computeLineScore, deriveGameState } from '@baseball/shared';
import type { LineScoreData, LiveGameState } from '@baseball/shared';
import type { GameEvent as SharedGameEvent } from '@baseball/shared';

/**
 * Reactively derives live game state from WatermelonDB game events.
 * Subscribes to the game_events table for this game and recomputes
 * state whenever a new event is added (offline or synced).
 *
 * Also returns the line score (inning-by-inning runs/hits/errors) so
 * league-rule advisories (mercy, run cap, regulation complete) can be
 * evaluated without an extra query.
 */
export function useGameState(gameRemoteId: string, homeTeamId: string) {
  const [gameState, setGameState] = useState<LiveGameState | null>(null);
  const [lineScore, setLineScore] = useState<LineScoreData | null>(null);
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

        const state = deriveGameState(gameRemoteId, sharedEvents, homeTeamId);
        setGameState(state);

        // computeLineScore expects snake_case rows (it's a database-row adapter
        // shared with the web client). Re-map the WDB models accordingly.
        const lineScoreRows = events.map((e) => ({
          event_type: e.eventType,
          inning: e.inning,
          is_top_of_inning: e.isTopOfInning,
          payload: e.payload,
        }));
        setLineScore(computeLineScore(lineScoreRows));
        setLoading(false);
      });

    return () => subscription.unsubscribe();
  }, [gameRemoteId, homeTeamId]);

  return { gameState, lineScore, loading };
}
