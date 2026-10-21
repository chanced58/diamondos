import { z } from 'zod';
import type { CreateTeamEventInput } from '@baseball/shared';
import { apiClient, type ApiClient } from '../../lib/api-client';
import { getSupabaseClient } from '../../lib/supabase';

/**
 * Team events (meetings, scrimmages, travel…). Reads go straight to Supabase —
 * team members may read their team's events under RLS — while create and
 * delete go through the web services that authorize coaches.
 */

export interface TeamEvent {
  id: string;
  teamId: string;
  title: string;
  eventType: string;
  startsAt: string;
  endsAt: string | null;
  location: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  description: string | null;
}

export const teamEventQueryKey = (eventId: string) => ['team-events', eventId] as const;

export async function fetchTeamEvent(eventId: string): Promise<TeamEvent | null> {
  const { data, error } = await getSupabaseClient()
    .from('team_events')
    .select('id, team_id, title, event_type, starts_at, ends_at, location, address, latitude, longitude, description')
    .eq('id', eventId)
    .maybeSingle();
  if (error) throw new Error(`Couldn't load the event: ${error.message}`);
  if (!data) return null;
  return {
    id: data.id,
    teamId: data.team_id,
    title: data.title,
    eventType: data.event_type,
    startsAt: data.starts_at,
    endsAt: data.ends_at,
    location: data.location,
    address: data.address,
    latitude: data.latitude,
    longitude: data.longitude,
    description: data.description,
  };
}

const eventIdResult = z.object({ eventId: z.string() });

export function createTeamEvent(input: CreateTeamEventInput, client: ApiClient = apiClient) {
  return client.post('/team-events', input, eventIdResult);
}

export function deleteTeamEvent(eventId: string, client: ApiClient = apiClient) {
  return client.delete(`/team-events/${encodeURIComponent(eventId)}`, eventIdResult);
}
