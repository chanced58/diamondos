import { z } from 'zod';
import { useQuery } from '@tanstack/react-query';
import {
  opponentLineupResponseSchema,
  type AddOpponentPlayerInput,
  type OpponentLineupEntry,
  type OpponentLineupResponse,
} from '@baseball/shared';
import { apiClient, type ApiClient } from '../../lib/api-client';

/**
 * The opponent lineup editor's server calls (`/api/m/v1/games/:gameId/opponent…`).
 * Online-only; after each write the caller triggers a sync so the offline
 * scorer's mirror of the roster and order catches up.
 */

export const opponentLineupQueryKey = (gameId: string) => ['games', gameId, 'opponent-lineup'] as const;

const gamePath = (gameId: string) => `/games/${encodeURIComponent(gameId)}`;
const gameIdResult = z.object({ gameId: z.string() });
const playerIdResult = z.object({ playerId: z.string() });

export type OpponentPlayerFields = Omit<AddOpponentPlayerInput, 'gameId'>;

export function fetchOpponentLineup(gameId: string, client: ApiClient = apiClient): Promise<OpponentLineupResponse> {
  return client.get(`${gamePath(gameId)}/opponent-lineup`, opponentLineupResponseSchema);
}

export function saveOpponentLineup(gameId: string, entries: OpponentLineupEntry[], client: ApiClient = apiClient) {
  return client.put(`${gamePath(gameId)}/opponent-lineup`, { entries }, gameIdResult);
}

export function autoFillOpponentLineup(gameId: string, client: ApiClient = apiClient) {
  return client.post(`${gamePath(gameId)}/opponent-lineup/auto-fill`, {}, gameIdResult);
}

export function saveOpponentTeam(gameId: string, name: string, client: ApiClient = apiClient) {
  return client.put(`${gamePath(gameId)}/opponent-team`, { name }, z.object({ opponentTeamId: z.string() }));
}

export function addOpponentPlayer(gameId: string, fields: OpponentPlayerFields, client: ApiClient = apiClient) {
  return client.post(`${gamePath(gameId)}/opponent-players`, fields, playerIdResult);
}

export function updateOpponentPlayer(
  gameId: string,
  playerId: string,
  fields: OpponentPlayerFields,
  client: ApiClient = apiClient,
) {
  return client.patch(`${gamePath(gameId)}/opponent-players/${encodeURIComponent(playerId)}`, fields, playerIdResult);
}

export function removeOpponentPlayer(gameId: string, playerId: string, client: ApiClient = apiClient) {
  return client.delete(`${gamePath(gameId)}/opponent-players/${encodeURIComponent(playerId)}`, playerIdResult);
}

export function useOpponentLineup(gameId: string) {
  return useQuery({
    queryKey: opponentLineupQueryKey(gameId),
    queryFn: () => fetchOpponentLineup(gameId),
    enabled: gameId.length > 0,
  });
}
