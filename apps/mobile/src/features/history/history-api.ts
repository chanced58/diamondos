import { z } from 'zod';
import { useQuery } from '@tanstack/react-query';
import { gameHistoryResponseSchema, type GameHistoryResponse } from '@baseball/shared';
import { apiClient, type ApiClient } from '../../lib/api-client';
import type { Replacement } from './history-model';

/**
 * Play-by-play history and coach corrections
 * (`/api/m/v1/games/:gameId/history`, `…/corrections/*`). Online-only; the
 * corrections append to the server log and reach the scorer by sync.
 */

export const historyQueryKey = (gameId: string) => ['games', gameId, 'history'] as const;

const gamePath = (gameId: string) => `/games/${encodeURIComponent(gameId)}`;
const corrected = z.object({ gameId: z.string() });

export function fetchGameHistory(gameId: string, client: ApiClient = apiClient): Promise<GameHistoryResponse> {
  return client.get(`${gamePath(gameId)}/history`, gameHistoryResponseSchema);
}

export function voidEvent(gameId: string, eventId: string, deviceId: string, client: ApiClient = apiClient) {
  return client.post(`${gamePath(gameId)}/corrections/void`, { eventId, deviceId }, corrected);
}

export function replaceEvent(
  gameId: string,
  eventId: string,
  replacement: Replacement,
  deviceId: string,
  client: ApiClient = apiClient,
) {
  return client.post(`${gamePath(gameId)}/corrections/replace`, { eventId, ...replacement, deviceId }, corrected);
}

const LIVE_REFRESH_MS = 15_000;

export function useGameHistory(gameId: string) {
  return useQuery({
    queryKey: historyQueryKey(gameId),
    queryFn: () => fetchGameHistory(gameId),
    enabled: gameId.length > 0,
    // A live game keeps growing; refresh while the screen is open.
    refetchInterval: (query) => (query.state.data?.status === 'in_progress' ? LIVE_REFRESH_MS : false),
  });
}
