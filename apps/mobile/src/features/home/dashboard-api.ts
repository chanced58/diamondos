import { useQuery } from '@tanstack/react-query';
import { dashboardResponseSchema, type DashboardResponse, type DashboardView } from '@baseball/shared';
import { apiClient, type ApiClient } from '../../lib/api-client';

/**
 * The Home tab's dashboard, from `/api/m/v1` (online-only): the same service as
 * the web dashboard. The scorer's resume card stays on local data, so it works
 * offline even when this doesn't load.
 */

/** Cache key for a team's dashboard in one view. */
export const dashboardQueryKey = (teamId: string, view: DashboardView) => ['teams', teamId, 'dashboard', view] as const;

/** Live games stay fresh while Home is open, without a realtime channel per game. */
const LIVE_REFRESH_MS = 30_000;

/** The team's dashboard; `league` widens games to the team's league. */
export function fetchDashboard(teamId: string, view: DashboardView, client: ApiClient = apiClient): Promise<DashboardResponse> {
  const query = view === 'league' ? '?view=league' : '';
  return client.get(`/teams/${encodeURIComponent(teamId)}/dashboard${query}`, dashboardResponseSchema);
}

/** The active team's dashboard, refreshed every 30 s while a game is live. */
export function useDashboard(teamId: string | undefined, view: DashboardView) {
  return useQuery({
    queryKey: dashboardQueryKey(teamId ?? '', view),
    queryFn: () => fetchDashboard(teamId ?? '', view),
    enabled: Boolean(teamId),
    // While switching between My team and the league, keep the same team's other view on screen
    // (and its switch usable); never carry one team's dashboard over to another team.
    placeholderData: (previous) => (previous?.teamId === teamId ? previous : undefined),
    refetchInterval: (query) => ((query.state.data?.liveGames.length ?? 0) > 0 ? LIVE_REFRESH_MS : false),
  });
}
