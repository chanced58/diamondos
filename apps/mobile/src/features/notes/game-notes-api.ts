import { z } from 'zod';
import { useQuery } from '@tanstack/react-query';
import { gameNotesResponseSchema, type GameNotesResponse } from '@baseball/shared';
import { apiClient, type ApiClient } from '../../lib/api-client';
import type { CoachNotesChanges } from './game-notes-model';

/** A game's notes (`/api/m/v1/games/:gameId/notes…`). Online-only. */

export const gameNotesQueryKey = (gameId: string) => ['games', gameId, 'notes'] as const;

const notesPath = (gameId: string) => `/games/${encodeURIComponent(gameId)}/notes`;
const savedResult = z.object({ gameId: z.string() });

export function fetchGameNotes(gameId: string, client: ApiClient = apiClient): Promise<GameNotesResponse> {
  return client.get(notesPath(gameId), gameNotesResponseSchema);
}

export function saveCoachNotes(gameId: string, changes: CoachNotesChanges, client: ApiClient = apiClient) {
  return client.put(notesPath(gameId), changes, savedResult);
}

export function savePlayerNotes(gameId: string, playerId: string, playerNotes: string, client: ApiClient = apiClient) {
  return client.put(`${notesPath(gameId)}/players/${encodeURIComponent(playerId)}`, { playerNotes }, savedResult);
}

export function useGameNotes(gameId: string) {
  return useQuery({
    queryKey: gameNotesQueryKey(gameId),
    queryFn: () => fetchGameNotes(gameId),
    enabled: gameId.length > 0,
  });
}
