import { useEffect, useState } from 'react';
import { Q } from '@nozbe/watermelondb';
import { database } from '../../db';
import type { GameEvent } from '../../db/models/GameEvent';
import {
  deriveDefensiveLineup,
  type DefensiveLineup,
  type DefensiveLineupEntry,
  type DefensiveLineupRoster,
} from '@baseball/shared';

/**
 * Reactively derives the team's current defensive alignment by replaying
 * substitution / pitching-change events against a synthetic starting lineup
 * built from each roster player's `primaryPosition`.
 *
 * The mobile app doesn't persist a per-game starting defensive lineup
 * (only the starting pitcher / leadoff batter via GAME_START), so the
 * primary-position fallback is a best effort. Positions remain empty when
 * no roster player claims them and no substitution has placed someone there.
 */
export function useDefensiveLineup(
  gameRemoteId: string,
  roster: {
    id: string;
    firstName?: string;
    lastName?: string;
    name?: string;
    jerseyNumber?: number | string | null;
    primaryPosition?: string | null;
  }[],
): DefensiveLineup | null {
  const [lineup, setLineup] = useState<DefensiveLineup | null>(null);

  useEffect(() => {
    if (!gameRemoteId) return;

    const baseLineup: DefensiveLineupEntry[] = roster
      .filter((r) => r.primaryPosition)
      .map((r) => ({
        playerId: r.id,
        startingPosition: r.primaryPosition ?? null,
        player: {
          firstName: r.firstName ?? '',
          lastName: r.lastName ?? r.name ?? '',
          jerseyNumber: r.jerseyNumber ?? null,
        },
      }));

    const rosterForDerive: DefensiveLineupRoster[] = roster.map((r) => ({
      id: r.id,
      firstName: r.firstName ?? '',
      lastName: r.lastName ?? r.name ?? '',
      jerseyNumber: r.jerseyNumber ?? null,
    }));

    const eventsCollection = database.get<GameEvent>('game_events');
    const subscription = eventsCollection
      .query(Q.where('game_remote_id', gameRemoteId), Q.sortBy('sequence_number', Q.asc))
      .observe()
      .subscribe((events) => {
        const mapped = events.map((e) => ({
          event_type: e.eventType as string,
          payload: e.payload as Record<string, unknown> | null,
        }));
        setLineup(deriveDefensiveLineup(baseLineup, rosterForDerive, mapped, false));
      });

    return () => subscription.unsubscribe();
    // Re-subscribe when the roster identity changes (new players added,
    // primary positions changed, etc.). Compare by a stable signature so
    // we don't churn on referentially-different but structurally-equal arrays.
  }, [gameRemoteId, rosterSignature(roster)]);

  return lineup;
}

function rosterSignature(roster: { id: string; primaryPosition?: string | null }[]): string {
  return roster.map((r) => `${r.id}:${r.primaryPosition ?? ''}`).join('|');
}
