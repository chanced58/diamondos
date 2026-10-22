import { z } from 'zod';
import { useQuery } from '@tanstack/react-query';
import {
  generatedScoutingCardResponseSchema,
  opponentTeamDetailResponseSchema,
  opponentTeamsResponseSchema,
  scoutingCardResponseSchema,
  type AddOpponentTeamPlayerInput,
  type CreateOpponentTeamInput,
  type OpponentTeamDetailResponse,
  type OpponentTeamsResponse,
  type ScoutingCardResponse,
  type UpdateOpponentTeamInput,
} from '@baseball/shared';
import { apiClient, type ApiClient } from '../../lib/api-client';

/**
 * A team's opponent teams, their rosters and AI scouting cards
 * (`/api/m/v1/teams/:teamId/opponent-teams`, `/api/m/v1/opponent-teams/:id…`).
 * Coaches only; online-only.
 */

/** Generating a card waits on the model, often well past the usual 15s. */
export const SCOUTING_CARD_TIMEOUT_MS = 180_000;

export type OpponentTeamFields = Omit<CreateOpponentTeamInput, 'teamId'>;
export type OpponentTeamPlayerFields = Omit<AddOpponentTeamPlayerInput, 'opponentTeamId'>;

const opponentTeamPath = (opponentTeamId: string) => `/opponent-teams/${encodeURIComponent(opponentTeamId)}`;
const playerIdResult = z.object({ playerId: z.string() });
const opponentTeamIdResult = z.object({ opponentTeamId: z.string() });

export const opponentTeamsQueryKey = (teamId: string) => ['teams', teamId, 'opponent-teams'] as const;
export const opponentTeamQueryKey = (opponentTeamId: string) => ['opponent-teams', opponentTeamId] as const;
export const scoutingCardQueryKey = (opponentTeamId: string) => ['opponent-teams', opponentTeamId, 'scouting-card'] as const;

export function fetchOpponentTeams(teamId: string, client: ApiClient = apiClient): Promise<OpponentTeamsResponse> {
  return client.get(`/teams/${encodeURIComponent(teamId)}/opponent-teams`, opponentTeamsResponseSchema);
}

export function createOpponentTeam(teamId: string, fields: OpponentTeamFields, client: ApiClient = apiClient) {
  return client.post(`/teams/${encodeURIComponent(teamId)}/opponent-teams`, fields, opponentTeamIdResult);
}

export function fetchOpponentTeam(opponentTeamId: string, client: ApiClient = apiClient): Promise<OpponentTeamDetailResponse> {
  return client.get(opponentTeamPath(opponentTeamId), opponentTeamDetailResponseSchema);
}

export function updateOpponentTeam(
  opponentTeamId: string,
  fields: Omit<UpdateOpponentTeamInput, 'opponentTeamId'>,
  client: ApiClient = apiClient,
) {
  return client.patch(opponentTeamPath(opponentTeamId), fields, opponentTeamIdResult);
}

export function addOpponentTeamPlayer(opponentTeamId: string, fields: OpponentTeamPlayerFields, client: ApiClient = apiClient) {
  return client.post(`${opponentTeamPath(opponentTeamId)}/players`, fields, playerIdResult);
}

export function updateOpponentTeamPlayer(
  opponentTeamId: string,
  playerId: string,
  fields: OpponentTeamPlayerFields,
  client: ApiClient = apiClient,
) {
  return client.patch(`${opponentTeamPath(opponentTeamId)}/players/${encodeURIComponent(playerId)}`, fields, playerIdResult);
}

export function removeOpponentTeamPlayer(opponentTeamId: string, playerId: string, client: ApiClient = apiClient) {
  return client.delete(`${opponentTeamPath(opponentTeamId)}/players/${encodeURIComponent(playerId)}`, playerIdResult);
}

export function fetchScoutingCard(opponentTeamId: string, client: ApiClient = apiClient): Promise<ScoutingCardResponse> {
  return client.get(`${opponentTeamPath(opponentTeamId)}/scouting-card`, scoutingCardResponseSchema);
}

export function generateScoutingCard(opponentTeamId: string, client: ApiClient = apiClient) {
  return client.request(`${opponentTeamPath(opponentTeamId)}/scouting-card`, {
    method: 'POST',
    schema: generatedScoutingCardResponseSchema,
    timeoutMs: SCOUTING_CARD_TIMEOUT_MS,
  });
}

export function useOpponentTeams(teamId: string | undefined) {
  return useQuery({
    queryKey: opponentTeamsQueryKey(teamId ?? ''),
    queryFn: () => fetchOpponentTeams(teamId ?? ''),
    enabled: Boolean(teamId),
  });
}

export function useOpponentTeam(opponentTeamId: string) {
  return useQuery({
    queryKey: opponentTeamQueryKey(opponentTeamId),
    queryFn: () => fetchOpponentTeam(opponentTeamId),
    enabled: opponentTeamId.length > 0,
  });
}

export function useScoutingCard(opponentTeamId: string) {
  return useQuery({
    queryKey: scoutingCardQueryKey(opponentTeamId),
    queryFn: () => fetchScoutingCard(opponentTeamId),
    enabled: opponentTeamId.length > 0,
  });
}
