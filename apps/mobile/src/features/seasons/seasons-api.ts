import { useQuery } from '@tanstack/react-query';
import {
  createSeasonResponseSchema,
  seasonWriteResponseSchema,
  teamSeasonsResponseSchema,
  type CreateSeasonResponse,
  type SeasonTerm,
  type SeasonWriteResponse,
  type TeamSeasonsResponse,
} from '@baseball/shared';
import { apiClient, type ApiClient } from '../../lib/api-client';

/**
 * A team's seasons through `/api/m/v1/teams/:teamId/seasons` (online-only):
 * the web team admin Seasons page.
 */

const seasonsPath = (teamId: string) => `/teams/${encodeURIComponent(teamId)}/seasons`;

/** Cache key for a team's seasons. */
export const teamSeasonsQueryKey = (teamId: string) => ['teams', teamId, 'seasons'] as const;

export function fetchTeamSeasons(teamId: string, client: ApiClient = apiClient): Promise<TeamSeasonsResponse> {
  return client.get(seasonsPath(teamId), teamSeasonsResponseSchema);
}

export function createSeason(teamId: string, term: SeasonTerm, year: number, client: ApiClient = apiClient): Promise<CreateSeasonResponse> {
  return client.post(seasonsPath(teamId), { term, year }, createSeasonResponseSchema);
}

export function activateSeason(teamId: string, seasonId: string, client: ApiClient = apiClient): Promise<SeasonWriteResponse> {
  return client.post(`${seasonsPath(teamId)}/${encodeURIComponent(seasonId)}/activate`, {}, seasonWriteResponseSchema);
}

export function deactivateSeason(teamId: string, seasonId: string, client: ApiClient = apiClient): Promise<SeasonWriteResponse> {
  return client.post(`${seasonsPath(teamId)}/${encodeURIComponent(seasonId)}/deactivate`, {}, seasonWriteResponseSchema);
}

export function useTeamSeasons(teamId: string | null) {
  return useQuery({
    queryKey: teamSeasonsQueryKey(teamId ?? ''),
    queryFn: () => fetchTeamSeasons(teamId as string),
    enabled: Boolean(teamId),
  });
}

/** The years a season can be created for: last year, this year and next (as on the web). */
export function seasonYears(today: Date = new Date()): number[] {
  const year = today.getFullYear();
  return [year - 1, year, year + 1];
}

/** "Mar 1, 2027 – May 31, 2027" for a season's dates (`YYYY-MM-DD`, read as local days). */
export function seasonDates(startDate: string, endDate: string | null): string {
  const format = (date: string) =>
    new Date(`${date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return endDate ? `${format(startDate)} – ${format(endDate)}` : `From ${format(startDate)}`;
}
