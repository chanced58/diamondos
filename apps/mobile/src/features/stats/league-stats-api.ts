import { useQuery } from '@tanstack/react-query';
import {
  leagueComparisonResponseSchema,
  leagueStatsResponseSchema,
  type LeagueComparisonResponse,
  type LeagueStatsResponse,
} from '@baseball/shared';
import { apiClient, type ApiClient } from '../../lib/api-client';

/**
 * The team's league: every player's stats (`/api/m/v1/teams/:teamId/league-stats`)
 * and the teams side by side (`…/league-comparison`). Online-only.
 */

const teamPath = (teamId: string) => `/teams/${encodeURIComponent(teamId)}`;

export const leagueStatsQueryKey = (teamId: string) => ['teams', teamId, 'league-stats'] as const;
export const leagueComparisonQueryKey = (teamId: string) => ['teams', teamId, 'league-comparison'] as const;

export function fetchLeagueStats(teamId: string, client: ApiClient = apiClient): Promise<LeagueStatsResponse> {
  return client.get(`${teamPath(teamId)}/league-stats`, leagueStatsResponseSchema);
}

export function fetchLeagueComparison(teamId: string, client: ApiClient = apiClient): Promise<LeagueComparisonResponse> {
  return client.get(`${teamPath(teamId)}/league-comparison`, leagueComparisonResponseSchema);
}

export function useLeagueStats(teamId: string | undefined) {
  return useQuery({
    queryKey: leagueStatsQueryKey(teamId ?? ''),
    queryFn: () => fetchLeagueStats(teamId ?? ''),
    enabled: Boolean(teamId),
  });
}

export function useLeagueComparison(teamId: string | undefined) {
  return useQuery({
    queryKey: leagueComparisonQueryKey(teamId ?? ''),
    queryFn: () => fetchLeagueComparison(teamId ?? ''),
    enabled: Boolean(teamId),
  });
}
