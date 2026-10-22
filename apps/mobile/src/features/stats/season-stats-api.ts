import { useQuery } from '@tanstack/react-query';
import {
  bullpenResponseSchema,
  seasonStatsResponseSchema,
  type BullpenResponse,
  type SeasonStatsResponse,
} from '@baseball/shared';
import { apiClient, type ApiClient } from '../../lib/api-client';
import { partsFromLocalDate } from '../forms/date-parts';

/**
 * A team's season stats (`/api/m/v1/teams/:teamId/stats`) and Bullpen Planner
 * (`…/bullpen`). Online-only.
 */

const teamPath = (teamId: string) => `/teams/${encodeURIComponent(teamId)}`;

/**
 * react-query placeholder: the previous result while a new key loads, but only
 * for the same team (keys are `['teams', teamId, …]`), so switching teams never
 * shows the last team's numbers.
 */
function sameTeamPlaceholder(teamId: string | undefined) {
  return <T>(previous: T | undefined, previousQuery?: { queryKey: readonly unknown[] }): T | undefined =>
    previousQuery?.queryKey[1] === teamId ? previous : undefined;
}

/** `seasonId` undefined → the server's default (the active season). */
export const seasonStatsQueryKey = (teamId: string, seasonId?: string) =>
  ['teams', teamId, 'season-stats', seasonId ?? 'default'] as const;

export function fetchSeasonStats(
  teamId: string,
  seasonId: string | undefined,
  client: ApiClient = apiClient,
): Promise<SeasonStatsResponse> {
  const query = seasonId ? `?season=${encodeURIComponent(seasonId)}` : '';
  return client.get(`${teamPath(teamId)}/stats${query}`, seasonStatsResponseSchema);
}

export function useSeasonStats(teamId: string | undefined, seasonId: string | undefined) {
  return useQuery({
    queryKey: seasonStatsQueryKey(teamId ?? '', seasonId),
    queryFn: () => fetchSeasonStats(teamId ?? '', seasonId),
    enabled: Boolean(teamId),
    // Keep the last season's tables up while another season loads (never another team's).
    placeholderData: sameTeamPlaceholder(teamId),
  });
}

/** Now, for rest status (its own function so screen tests can pin the clock). */
export function currentTime(): Date {
  return new Date();
}

/** The device's local date, YYYY-MM-DD. */
export function localToday(now: Date = new Date()): string {
  return partsFromLocalDate(now).date;
}

/** `date` undefined → the server's default (the next game's day, else today). */
export const bullpenQueryKey = (teamId: string, date?: string) => ['teams', teamId, 'bullpen', date ?? 'default'] as const;

export function fetchBullpenPlan(
  teamId: string,
  date: string | undefined,
  client: ApiClient = apiClient,
): Promise<BullpenResponse> {
  const params = new URLSearchParams({ today: localToday() });
  if (date) params.set('date', date);
  return client.get(`${teamPath(teamId)}/bullpen?${params.toString()}`, bullpenResponseSchema);
}

export function useBullpenPlan(teamId: string | undefined, date: string | undefined) {
  return useQuery({
    queryKey: bullpenQueryKey(teamId ?? '', date),
    queryFn: () => fetchBullpenPlan(teamId ?? '', date),
    enabled: Boolean(teamId),
    placeholderData: sameTeamPlaceholder(teamId),
  });
}
