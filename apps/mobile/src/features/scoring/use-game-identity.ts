import { useEffect, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { Q } from '@nozbe/watermelondb';
import { database } from '../../db';
import type { Game } from '../../db/models/Game';
import { useRole } from '../../providers/RoleProvider';
import { resolveGameIdentity, type GameIdentity } from './game-identity';

export type { GameIdentity, GameIdentityGame, GameIdentityParams, GameIdentityActiveTeam, GameIdentityInput } from './game-identity';
export { resolveGameIdentity } from './game-identity';

/**
 * Resolves the Game row from the local DB — the games list (and any deep
 * link or push notification) only guarantees a game id, so team identity
 * (roster, league settings) and home/away must come from the synced games
 * mirror, not route params — then derives display identity via the pure
 * `resolveGameIdentity` (kept in `game-identity.ts` so it can be unit-tested
 * without pulling in this file's WatermelonDB / RoleProvider dependencies).
 */
export function useGameIdentity(gameId: string): GameIdentity & { game: Game | null } {
  // Required (not optional) fields here, matching the pre-extraction
  // score.tsx shape — an optional-property generic trips expo-router's
  // `useLocalSearchParams` overload resolution onto its route-name-checked
  // overload (`TRoute extends Routes`), which this literal params type was
  // never meant to satisfy.
  const {
    teamId: teamIdParam = '',
    teamName: teamNameParam = '',
    opponentName: opponentNameParam = '',
  } = useLocalSearchParams<{ teamId: string; teamName: string; opponentName: string }>();
  const { activeTeam } = useRole();

  // `game` alone isn't enough to know whether it reflects the *current*
  // `gameId`: when `gameId` changes, the previous row would otherwise stay
  // in state until the new lookup resolves — or forever, if it fails —
  // letting the scoring screen use the wrong roster, league rules, and
  // `isHome`. `resolvedGameId` records which `gameId` `game` was fetched
  // for, so it's only exposed when the two still match.
  const [game, setGame] = useState<Game | null>(null);
  const [resolvedGameId, setResolvedGameId] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const matches = await database
          .get<Game>('games')
          .query(Q.where('remote_id', gameId))
          .fetch();
        if (cancelled) return;
        setGame(matches[0] ?? null);
        setResolvedGameId(gameId);
      } catch (err) {
        console.warn(`Score game lookup failed game=${gameId}:`, err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [gameId]);

  const currentGame = resolvedGameId === gameId ? game : null;

  const identity = resolveGameIdentity({
    game: currentGame
      ? {
          teamId: currentGame.teamId,
          opponentName: currentGame.opponentName,
          locationType: currentGame.locationType,
          neutralHomeTeam: currentGame.neutralHomeTeam ?? null,
        }
      : null,
    params: {
      teamId: teamIdParam,
      teamName: teamNameParam,
      opponentName: opponentNameParam,
    },
    activeTeam: activeTeam ? { teamId: activeTeam.teamId, teamName: activeTeam.teamName } : null,
  });

  return { game: currentGame, ...identity };
}
