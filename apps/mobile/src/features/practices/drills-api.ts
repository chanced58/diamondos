import { z } from 'zod';
import { useQuery } from '@tanstack/react-query';
import {
  drillDetailResponseSchema,
  drillsListResponseSchema,
  type CreateTeamDrillInput,
  type DrillDetailResponse,
  type DrillsListResponse,
  type PlanPracticeInput,
} from '@baseball/shared';
import { apiClient, type ApiClient } from '../../lib/api-client';

/**
 * The drill library and planning a practice from drills, through `/api/m/v1`
 * (online-only). Members browse the curated drills and the team's own; coaches
 * add, edit and delete the team's.
 */

type DrillFields = CreateTeamDrillInput['drill'];

const teamPath = (teamId: string) => `/teams/${encodeURIComponent(teamId)}`;
const drillPath = (drillId: string) => `/drills/${encodeURIComponent(drillId)}`;
const drillIdResult = z.object({ drillId: z.string() });
const practiceIdResult = z.object({ practiceId: z.string() });

/** Cache key for a team's drill library. */
export const drillsQueryKey = (teamId: string) => ['teams', teamId, 'drills'] as const;
/** Cache key for one drill as a team sees it. */
export const drillQueryKey = (teamId: string, drillId: string) => ['teams', teamId, 'drills', drillId] as const;

/** The curated drills and the team's own. */
export function fetchDrills(teamId: string, client: ApiClient = apiClient): Promise<DrillsListResponse> {
  return client.get(`${teamPath(teamId)}/drills`, drillsListResponseSchema);
}

/** One drill, with what it fixes for the team and whether the viewer may edit it. */
export function fetchDrill(teamId: string, drillId: string, client: ApiClient = apiClient): Promise<DrillDetailResponse> {
  return client.get(`${drillPath(drillId)}?teamId=${encodeURIComponent(teamId)}`, drillDetailResponseSchema);
}

/** Adds a drill to the team's library; resolves to its id. */
export function createDrill(teamId: string, drill: DrillFields, client: ApiClient = apiClient) {
  return client.post(`${teamPath(teamId)}/drills`, { drill }, drillIdResult);
}

/** Replaces one of the team's drills' fields. */
export function updateDrill(drillId: string, drill: DrillFields, client: ApiClient = apiClient) {
  return client.patch(drillPath(drillId), { drill }, drillIdResult);
}

/** Deletes one of the team's drills. */
export function deleteDrill(drillId: string, client: ApiClient = apiClient) {
  return client.delete(drillPath(drillId), drillIdResult);
}

/** Creates a practice with a block per drill, in order, and the plan as coach notes. */
export function planPractice(teamId: string, fields: Omit<PlanPracticeInput, 'teamId'>, client: ApiClient = apiClient) {
  return client.post(`${teamPath(teamId)}/practices/plan`, fields, practiceIdResult);
}

/** The team's drill library. */
export function useDrills(teamId: string | undefined) {
  return useQuery({
    queryKey: drillsQueryKey(teamId ?? ''),
    queryFn: () => fetchDrills(teamId ?? ''),
    enabled: Boolean(teamId),
  });
}

/** One drill as the team sees it. */
export function useDrill(teamId: string | undefined, drillId: string) {
  return useQuery({
    queryKey: drillQueryKey(teamId ?? '', drillId),
    queryFn: () => fetchDrill(teamId ?? '', drillId),
    enabled: Boolean(teamId) && drillId.length > 0,
  });
}
