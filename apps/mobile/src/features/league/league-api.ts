import { useQuery } from '@tanstack/react-query';
import { leaguePageResponseSchema, type LeaguePageResponse } from '@baseball/shared';
import { apiClient, type ApiClient } from '../../lib/api-client';

/** The team's league page from `/api/m/v1` (online-only): the same service as the web /league page. */

/** Cache key for a team's league page. */
export const leaguePageQueryKey = (teamId: string) => ['teams', teamId, 'league'] as const;

/** The league, counters, standings by division and staff, for a member of the team. */
export function fetchLeaguePage(teamId: string, client: ApiClient = apiClient): Promise<LeaguePageResponse> {
  return client.get(`/teams/${encodeURIComponent(teamId)}/league`, leaguePageResponseSchema);
}

/** The active team's league page. */
export function useLeaguePage(teamId: string | undefined) {
  return useQuery({
    queryKey: leaguePageQueryKey(teamId ?? ''),
    queryFn: () => fetchLeaguePage(teamId ?? ''),
    enabled: Boolean(teamId),
  });
}
