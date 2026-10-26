import { useQuery } from '@tanstack/react-query';
import { leagueHomeResponseSchema, leagueTeamResponseSchema, type LeagueHomeResponse, type LeagueTeamResponse } from '@baseball/shared';
import { apiClient, type ApiClient } from '../../lib/api-client';

/**
 * The league home and a team's stat page in the league, from `/api/m/v1`
 * (online-only): the web /l/:slug pages' loaders, as a signed-in viewer sees them.
 */

/** Cache key for a league home in a season (empty = the league's current season). */
export const leagueHomeQueryKey = (slug: string, season: string) => ['leagues', slug, 'home', season] as const;
/** Cache key for a team's page in a league and season. */
export const leagueTeamQueryKey = (slug: string, teamId: string, season: string) => ['leagues', slug, 'teams', teamId, season] as const;

/** Query string from the set values only. */
function query(params: Record<string, string | undefined>): string {
  const entries = Object.entries(params).filter((entry): entry is [string, string] => Boolean(entry[1]));
  return entries.length ? `?${new URLSearchParams(entries).toString()}` : '';
}

const leaguePath = (slug: string) => `/leagues/${encodeURIComponent(slug)}`;

/** The league home; `teamId` marks the viewer's own team. */
export function fetchLeagueHome(slug: string, season?: string, teamId?: string, client: ApiClient = apiClient): Promise<LeagueHomeResponse> {
  return client.get(`${leaguePath(slug)}/home${query({ season, teamId })}`, leagueHomeResponseSchema);
}

/** A team's stat page in the league. */
export function fetchLeagueTeam(slug: string, teamId: string, season?: string, client: ApiClient = apiClient): Promise<LeagueTeamResponse> {
  return client.get(`${leaguePath(slug)}/teams/${encodeURIComponent(teamId)}${query({ season })}`, leagueTeamResponseSchema);
}

/** The league home in a season (undefined = the league's current season). */
export function useLeagueHome(slug: string, season: string | undefined, teamId: string | undefined) {
  return useQuery({
    queryKey: [...leagueHomeQueryKey(slug, season ?? ''), teamId ?? ''],
    queryFn: () => fetchLeagueHome(slug, season, teamId),
    enabled: slug.length > 0,
  });
}

/** A team's stat page in the league. */
export function useLeagueTeam(slug: string, teamId: string, season: string | undefined) {
  return useQuery({
    queryKey: leagueTeamQueryKey(slug, teamId, season ?? ''),
    queryFn: () => fetchLeagueTeam(slug, teamId, season),
    enabled: slug.length > 0 && teamId.length > 0,
  });
}
