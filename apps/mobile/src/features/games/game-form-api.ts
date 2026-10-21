import {
  gameFormOptionsSchema,
  gameIdResultSchema,
  type CreateGameFormInput,
  type GameFormOptions,
  type UpdateGameFormInput,
} from '@baseball/shared';
import { apiClient, type ApiClient } from '../../lib/api-client';

/** Creating and editing games (`/api/m/v1/games…`). Online-only. */

export const gameFormOptionsQueryKey = (teamId: string) => ['teams', teamId, 'game-form-options'] as const;

export function fetchGameFormOptions(teamId: string, client: ApiClient = apiClient): Promise<GameFormOptions> {
  return client.get(`/teams/${encodeURIComponent(teamId)}/game-form-options`, gameFormOptionsSchema);
}

export function createGame(input: CreateGameFormInput, client: ApiClient = apiClient) {
  return client.post('/games', input, gameIdResultSchema);
}

export function updateGame(gameId: string, input: Omit<UpdateGameFormInput, 'gameId'>, client: ApiClient = apiClient) {
  return client.patch(`/games/${encodeURIComponent(gameId)}`, input, gameIdResultSchema);
}
