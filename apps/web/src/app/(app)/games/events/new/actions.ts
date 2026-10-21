'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { createTeamEvent } from '@/lib/services/team-events/create-team-event';

export async function createTeamEventAction(_prevState: string | null | undefined, formData: FormData) {
  const authClient = createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return 'Not authenticated — please log in again.';

  const teamId      = formData.get('teamId') as string;
  const title       = (formData.get('title') as string)?.trim();
  const eventType   = (formData.get('eventType') as string) || 'other';
  const startDate   = formData.get('startDate') as string;
  const startTime   = (formData.get('startTime') as string) || '09:00';
  const endDate     = (formData.get('endDate') as string) || null;
  const endTime     = (formData.get('endTime') as string) || null;

  // Structured address fields from AddressAutocomplete
  const latRaw    = formData.get('location_latitude') as string;
  const lngRaw    = formData.get('location_longitude') as string;

  if (!teamId)    return 'Missing team ID.';
  if (!title)     return 'Event title is required.';
  if (!startDate) return 'Start date is required.';

  const startsAt = new Date(`${startDate}T${startTime}`).toISOString();
  const endsAt =
    endDate && endTime
      ? new Date(`${endDate}T${endTime}`).toISOString()
      : endDate
      ? new Date(`${endDate}T${startTime}`).toISOString()
      : null;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const result = await createTeamEvent(supabase, user.id, {
    teamId,
    title,
    eventType,
    startsAt,
    endsAt,
    location:    formData.get('location') as string | null,
    address:     formData.get('location_address') as string | null,
    latitude:    latRaw ? parseFloat(latRaw) : null,
    longitude:   lngRaw ? parseFloat(lngRaw) : null,
    placeId:     formData.get('location_place_id') as string | null,
    description: formData.get('description') as string | null,
    notifyTeam:  formData.get('notifyTeam') === 'on',
  });

  if (!result.ok) return result.error;

  redirect(`/games/events/${result.data.eventId}`);
}
