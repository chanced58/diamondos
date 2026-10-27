import { useQuery } from '@tanstack/react-query';
import {
  leaguePlayerCreatedResponseSchema,
  leaguePlayerDetailResponseSchema,
  leaguePlayersResponseSchema,
  releaseLeaguePlayerResponseSchema,
  transferLeaguePlayerResponseSchema,
  type CreateLeaguePlayerInput,
  type LeaguePlayerCreatedResponse,
  type LeaguePlayerDetailResponse,
  type LeaguePlayersResponse,
  type ReleaseLeaguePlayerResponse,
  type TransferLeaguePlayerResponse,
} from '@baseball/shared';
import { apiClient, type ApiClient } from '../../lib/api-client';

/**
 * League administration through `/api/m/v1/league-admin/:leagueId/*`
 * (online-only): league staff read, league admins change.
 */

const leaguePath = (leagueId: string) => `/league-admin/${encodeURIComponent(leagueId)}`;
const playerPath = (leagueId: string, playerId: string) => `${leaguePath(leagueId)}/players/${encodeURIComponent(playerId)}`;

/** Cache keys; everything for a league sits under `['league-admin', leagueId]`. */
export const leagueAdminQueryKey = (leagueId: string) => ['league-admin', leagueId] as const;
export const leaguePlayersQueryKey = (leagueId: string) => ['league-admin', leagueId, 'players'] as const;
export const leaguePlayerQueryKey = (leagueId: string, playerId: string) => ['league-admin', leagueId, 'players', playerId] as const;

export function fetchLeaguePlayers(leagueId: string, client: ApiClient = apiClient): Promise<LeaguePlayersResponse> {
  return client.get(`${leaguePath(leagueId)}/players`, leaguePlayersResponseSchema);
}

export function fetchLeaguePlayer(leagueId: string, playerId: string, client: ApiClient = apiClient): Promise<LeaguePlayerDetailResponse> {
  return client.get(playerPath(leagueId, playerId), leaguePlayerDetailResponseSchema);
}

export type NewLeaguePlayer = Omit<CreateLeaguePlayerInput, 'leagueId'>;

export function createLeaguePlayer(leagueId: string, player: NewLeaguePlayer, client: ApiClient = apiClient): Promise<LeaguePlayerCreatedResponse> {
  return client.post(`${leaguePath(leagueId)}/players`, player, leaguePlayerCreatedResponseSchema);
}

export interface PlayerMove {
  toTeamId: string;
  /** ISO timestamp; the move is effective now when omitted. */
  effectiveAt?: string;
  reason?: string;
  /** Move them even though their jersey number is taken there, clearing it. */
  acceptJerseyClear: boolean;
}

export function transferLeaguePlayer(
  leagueId: string,
  playerId: string,
  move: PlayerMove,
  client: ApiClient = apiClient,
): Promise<TransferLeaguePlayerResponse> {
  return client.post(`${playerPath(leagueId, playerId)}/transfer`, move, transferLeaguePlayerResponseSchema);
}

export function releaseLeaguePlayer(
  leagueId: string,
  playerId: string,
  release: { reason?: string },
  client: ApiClient = apiClient,
): Promise<ReleaseLeaguePlayerResponse> {
  return client.post(`${playerPath(leagueId, playerId)}/release`, release, releaseLeaguePlayerResponseSchema);
}

export function useLeaguePlayers(leagueId: string) {
  return useQuery({
    queryKey: leaguePlayersQueryKey(leagueId),
    queryFn: () => fetchLeaguePlayers(leagueId),
    enabled: Boolean(leagueId),
  });
}

export function useLeaguePlayer(leagueId: string, playerId: string) {
  return useQuery({
    queryKey: leaguePlayerQueryKey(leagueId, playerId),
    queryFn: () => fetchLeaguePlayer(leagueId, playerId),
    enabled: Boolean(leagueId && playerId),
  });
}
