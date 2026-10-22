import { useQuery } from '@tanstack/react-query';
import { gameBoxScoreResponseSchema, type GameBoxScoreResponse } from '@baseball/shared';
import { apiClient, type ApiClient } from '../../lib/api-client';

/** A started game's box score (`/api/m/v1/games/:gameId/box-score`). Online-only. */

export const boxScoreQueryKey = (gameId: string) => ['games', gameId, 'box-score'] as const;

export function fetchBoxScore(gameId: string, client: ApiClient = apiClient): Promise<GameBoxScoreResponse> {
  return client.get(`/games/${encodeURIComponent(gameId)}/box-score`, gameBoxScoreResponseSchema);
}

export function useBoxScore(gameId: string) {
  return useQuery({
    queryKey: boxScoreQueryKey(gameId),
    queryFn: () => fetchBoxScore(gameId),
    enabled: gameId.length > 0,
  });
}
