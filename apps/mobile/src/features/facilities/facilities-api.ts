import { z } from 'zod';
import { useQuery } from '@tanstack/react-query';
import {
  facilityScheduleResponseSchema,
  type CreateBookingInput,
  type CreateFacilityInput,
  type FacilityScheduleResponse,
} from '@baseball/shared';
import { apiClient, type ApiClient } from '../../lib/api-client';

/**
 * A team's facilities and bookings (`/api/m/v1/teams/:teamId/facilit…`).
 * Online-only.
 */

export const facilitiesQueryKey = (teamId: string) => ['teams', teamId, 'facilities'] as const;
export const facilityScheduleQueryKey = (teamId: string, from: string) => [...facilitiesQueryKey(teamId), from] as const;

const teamPath = (teamId: string) => `/teams/${encodeURIComponent(teamId)}`;

export function fetchFacilitySchedule(
  teamId: string,
  window: { from: string; to: string },
  client: ApiClient = apiClient,
): Promise<FacilityScheduleResponse> {
  const query = `from=${encodeURIComponent(window.from)}&to=${encodeURIComponent(window.to)}`;
  return client.get(`${teamPath(teamId)}/facilities?${query}`, facilityScheduleResponseSchema);
}

export function useFacilitySchedule(teamId: string | undefined, window: { from: string; to: string }) {
  return useQuery({
    queryKey: facilityScheduleQueryKey(teamId ?? '', window.from),
    queryFn: () => fetchFacilitySchedule(teamId ?? '', window),
    enabled: Boolean(teamId),
  });
}

export function createFacility(teamId: string, input: Omit<CreateFacilityInput, 'teamId'>, client: ApiClient = apiClient) {
  return client.post(`${teamPath(teamId)}/facilities`, input, z.object({ facilityId: z.string() }));
}

export function deleteFacility(teamId: string, facilityId: string, client: ApiClient = apiClient) {
  return client.delete(`${teamPath(teamId)}/facilities/${encodeURIComponent(facilityId)}`, z.object({ facilityId: z.string() }));
}

export function createBooking(teamId: string, input: Omit<CreateBookingInput, 'teamId'>, client: ApiClient = apiClient) {
  return client.post(`${teamPath(teamId)}/facility-bookings`, input, z.object({ bookingId: z.string() }));
}

export function deleteBooking(teamId: string, bookingId: string, client: ApiClient = apiClient) {
  return client.delete(`${teamPath(teamId)}/facility-bookings/${encodeURIComponent(bookingId)}`, z.object({ bookingId: z.string() }));
}
