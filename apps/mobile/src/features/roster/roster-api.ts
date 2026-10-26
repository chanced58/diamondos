import { useQuery } from '@tanstack/react-query';
import {
  createRosterPlayerResponseSchema,
  injuryFlagWriteResponseSchema,
  playerAvailabilityResponseSchema,
  rosterPlayerResponseSchema,
  rosterPlayerWriteResponseSchema,
  type CreateRosterPlayerResponse,
  type InjuryFlagWriteResponse,
  type PlayerAvailabilityResponse,
  type RosterPlayerFields,
  type RosterPlayerResponse,
  type RosterPlayerWriteResponse,
} from '@baseball/shared';
import { apiClient, type ApiClient } from '../../lib/api-client';

/**
 * Roster management through `/api/m/v1/teams/:teamId/players` (online-only).
 * The roster list itself stays the offline WatermelonDB mirror; after a write
 * the caller syncs so the list catches up.
 */

const playerPath = (teamId: string, playerId: string) =>
  `/teams/${encodeURIComponent(teamId)}/players/${encodeURIComponent(playerId)}`;

/** Cache key for one player. */
export const rosterPlayerQueryKey = (teamId: string, playerId: string) => ['roster', teamId, playerId] as const;
/** Cache key for one player's injury and availability flags. */
export const playerAvailabilityQueryKey = (teamId: string, playerId: string) => ['roster', teamId, playerId, 'availability'] as const;

export function fetchRosterPlayer(teamId: string, playerId: string, client: ApiClient = apiClient): Promise<RosterPlayerResponse> {
  return client.get(playerPath(teamId, playerId), rosterPlayerResponseSchema);
}

/** Adds a player; with an email the server also invites them to the team. */
export function createRosterPlayer(
  teamId: string,
  fields: RosterPlayerFields,
  client: ApiClient = apiClient,
): Promise<CreateRosterPlayerResponse> {
  return client.post(`/teams/${encodeURIComponent(teamId)}/players`, fields, createRosterPlayerResponseSchema);
}

/** Replaces every editable field. */
export function updateRosterPlayer(
  teamId: string,
  playerId: string,
  fields: RosterPlayerFields,
  client: ApiClient = apiClient,
): Promise<RosterPlayerWriteResponse> {
  return client.patch(playerPath(teamId, playerId), fields, rosterPlayerWriteResponseSchema);
}

export function deactivateRosterPlayer(teamId: string, playerId: string, client: ApiClient = apiClient): Promise<RosterPlayerWriteResponse> {
  return client.post(`${playerPath(teamId, playerId)}/deactivate`, {}, rosterPlayerWriteResponseSchema);
}

export function reactivateRosterPlayer(
  teamId: string,
  playerId: string,
  jerseyNumber: number | null,
  client: ApiClient = apiClient,
): Promise<RosterPlayerWriteResponse> {
  return client.post(`${playerPath(teamId, playerId)}/reactivate`, { jerseyNumber }, rosterPlayerWriteResponseSchema);
}

export function fetchPlayerAvailability(teamId: string, playerId: string, client: ApiClient = apiClient): Promise<PlayerAvailabilityResponse> {
  return client.get(`${playerPath(teamId, playerId)}/injury-flags`, playerAvailabilityResponseSchema);
}

export interface NewInjuryFlag {
  injurySlug: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  notes: string | null;
}

export function addInjuryFlag(
  teamId: string,
  playerId: string,
  flag: NewInjuryFlag,
  client: ApiClient = apiClient,
): Promise<InjuryFlagWriteResponse> {
  return client.post(`${playerPath(teamId, playerId)}/injury-flags`, flag, injuryFlagWriteResponseSchema);
}

/** Ends a flag on `endDate`, the device's today. */
export function endInjuryFlag(
  teamId: string,
  playerId: string,
  flagId: string,
  endDate: string,
  client: ApiClient = apiClient,
): Promise<InjuryFlagWriteResponse> {
  return client.post(
    `${playerPath(teamId, playerId)}/injury-flags/${encodeURIComponent(flagId)}/end`,
    { endDate },
    injuryFlagWriteResponseSchema,
  );
}

export function useRosterPlayer(teamId: string | null, playerId: string) {
  return useQuery({
    queryKey: rosterPlayerQueryKey(teamId ?? '', playerId),
    queryFn: () => fetchRosterPlayer(teamId as string, playerId),
    enabled: Boolean(teamId && playerId),
  });
}

export function usePlayerAvailability(teamId: string | null, playerId: string) {
  return useQuery({
    queryKey: playerAvailabilityQueryKey(teamId ?? '', playerId),
    queryFn: () => fetchPlayerAvailability(teamId as string, playerId),
    enabled: Boolean(teamId && playerId),
  });
}
