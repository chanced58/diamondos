import { z } from 'zod';
import { gameDetailResponseSchema, type GameDetailResponse } from '@baseball/shared';
import { apiClient, type ApiClient } from '../../lib/api-client';

/**
 * The game detail screen's server calls (`/api/m/v1/games/:gameId…`). All
 * online-only: the scorer's offline event log never goes through these.
 */

export const gameDetailQueryKey = (gameId: string) => ['games', gameId, 'detail'] as const;

const gameIdResult = z.object({ gameId: z.string() });
const recalculateResult = gameIdResult.extend({ homeScore: z.number(), awayScore: z.number() });
const overrideResult = z.object({ homeGameId: z.string() });

const gamePath = (gameId: string) => `/games/${encodeURIComponent(gameId)}`;

export function fetchGameDetail(gameId: string, client: ApiClient = apiClient): Promise<GameDetailResponse> {
  return client.get(gamePath(gameId), gameDetailResponseSchema);
}

export function cancelGame(gameId: string, notifyTeam: boolean, client: ApiClient = apiClient) {
  return client.post(`${gamePath(gameId)}/cancel`, { notifyTeam }, gameIdResult);
}

export function resetGame(gameId: string, deviceId: string, client: ApiClient = apiClient) {
  return client.post(`${gamePath(gameId)}/reset`, { deviceId }, gameIdResult);
}

export function recalculateScores(gameId: string, client: ApiClient = apiClient) {
  return client.post(`${gamePath(gameId)}/recalculate`, {}, recalculateResult);
}

export function setReconciliationOverride(
  reconciliationId: string,
  conflictKey: string,
  useAwayValue: boolean,
  client: ApiClient = apiClient,
) {
  return client.post(
    `/reconciliations/${encodeURIComponent(reconciliationId)}/overrides`,
    { conflictKey, useAwayValue },
    overrideResult,
  );
}
