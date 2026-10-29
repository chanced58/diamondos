import { useQuery } from '@tanstack/react-query';
import {
  leagueDivisionWriteResponseSchema,
  leagueScoringSettingsResponseSchema,
  leaguePlayerCreatedResponseSchema,
  leaguePlayerDetailResponseSchema,
  leaguePlayersResponseSchema,
  leagueTeamWriteResponseSchema,
  leagueTeamsResponseSchema,
  releaseLeaguePlayerResponseSchema,
  saveLeagueScoringSettingsResponseSchema,
  transferLeaguePlayerResponseSchema,
  type CreateLeaguePlayerInput,
  type LeagueDivisionWriteResponse,
  type LeagueScoringSettings,
  type LeagueScoringSettingsResponse,
  type LeaguePlayerCreatedResponse,
  type LeaguePlayerDetailResponse,
  type LeaguePlayersResponse,
  type LeagueTeamWriteResponse,
  type LeagueTeamsResponse,
  type ReleaseLeaguePlayerResponse,
  type SaveLeagueScoringSettingsResponse,
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
export const leagueTeamsQueryKey = (leagueId: string) => ['league-admin', leagueId, 'teams'] as const;
const teamPath = (leagueId: string, membershipId: string) => `${leaguePath(leagueId)}/teams/${encodeURIComponent(membershipId)}`;

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

// ── Teams and divisions ──────────────────────────────────────────────────────

export function fetchLeagueTeams(leagueId: string, client: ApiClient = apiClient): Promise<LeagueTeamsResponse> {
  return client.get(`${leaguePath(leagueId)}/teams`, leagueTeamsResponseSchema);
}

export function addLeagueDivision(leagueId: string, name: string, client: ApiClient = apiClient): Promise<LeagueDivisionWriteResponse> {
  return client.post(`${leaguePath(leagueId)}/divisions`, { name }, leagueDivisionWriteResponseSchema);
}

export function removeLeagueDivision(leagueId: string, divisionId: string, client: ApiClient = apiClient): Promise<LeagueDivisionWriteResponse> {
  return client.delete(`${leaguePath(leagueId)}/divisions/${encodeURIComponent(divisionId)}`, leagueDivisionWriteResponseSchema);
}

/** Moves a team into a division, or out of every one with `null`. */
export function setLeagueTeamDivision(
  leagueId: string,
  membershipId: string,
  divisionId: string | null,
  client: ApiClient = apiClient,
): Promise<LeagueTeamWriteResponse> {
  return client.post(`${teamPath(leagueId, membershipId)}/division`, { divisionId }, leagueTeamWriteResponseSchema);
}

export function setLeagueTeamActive(
  leagueId: string,
  membershipId: string,
  isActive: boolean,
  client: ApiClient = apiClient,
): Promise<LeagueTeamWriteResponse> {
  return client.post(`${teamPath(leagueId, membershipId)}/active`, { isActive }, leagueTeamWriteResponseSchema);
}

export function removeLeagueTeam(leagueId: string, membershipId: string, client: ApiClient = apiClient): Promise<LeagueTeamWriteResponse> {
  return client.delete(teamPath(leagueId, membershipId), leagueTeamWriteResponseSchema);
}

export function useLeagueTeams(leagueId: string) {
  return useQuery({
    queryKey: leagueTeamsQueryKey(leagueId),
    queryFn: () => fetchLeagueTeams(leagueId),
    enabled: Boolean(leagueId),
  });
}

// ── Scoring settings ─────────────────────────────────────────────────────────

export const leagueScoringSettingsQueryKey = (leagueId: string) => ['league-admin', leagueId, 'scoring-settings'] as const;

export function fetchLeagueScoringSettings(leagueId: string, client: ApiClient = apiClient): Promise<LeagueScoringSettingsResponse> {
  return client.get(`${leaguePath(leagueId)}/scoring-settings`, leagueScoringSettingsResponseSchema);
}

/** Saves the whole settings blob, as the web form does. */
export function saveLeagueScoringSettings(
  leagueId: string,
  settings: LeagueScoringSettings,
  client: ApiClient = apiClient,
): Promise<SaveLeagueScoringSettingsResponse> {
  return client.post(`${leaguePath(leagueId)}/scoring-settings`, { settings }, saveLeagueScoringSettingsResponseSchema);
}

export function useLeagueScoringSettings(leagueId: string) {
  return useQuery({
    queryKey: leagueScoringSettingsQueryKey(leagueId),
    queryFn: () => fetchLeagueScoringSettings(leagueId),
    enabled: Boolean(leagueId),
  });
}
