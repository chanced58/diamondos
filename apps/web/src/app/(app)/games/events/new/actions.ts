'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { isValidTimeZone, zonedDateTimeToUtc } from '@baseball/shared';
import { createServerClient } from '@/lib/supabase/server';
import { resolveGameTimeZone } from '@/lib/games/game-time-zone';
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

  const latitude = parseCoordinate(latRaw);
  const longitude = parseCoordinate(lngRaw);
  const browserTimeZone = formData.get('browserTimeZone') as string | null;

  // The typed times are wall-clock at the venue (or in the coach's browser
  // when no venue was picked). This action runs in UTC, so never let
  // `new Date()` interpret them.
  const timeZone = resolveGameTimeZone({ latitude, longitude, browserTimeZone }) ?? 'UTC';
  let startsAt: string;
  let endsAt: string | null;
  try {
    startsAt = zonedDateTimeToUtc(startDate, startTime, timeZone);
    endsAt = endDate ? zonedDateTimeToUtc(endDate, endTime ?? startTime, timeZone) : null;
  } catch {
    return 'Invalid event date or time.';
  }

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
    latitude,
    longitude,
    placeId:     formData.get('location_place_id') as string | null,
    description: formData.get('description') as string | null,
    notifyTeam:  formData.get('notifyTeam') === 'on',
    timeZone:    isValidTimeZone(browserTimeZone) ? browserTimeZone : null,
  });

  if (!result.ok) return result.error;

  redirect(`/games/events/${result.data.eventId}`);
}

/** A form coordinate, or null when missing or not a finite number. */
function parseCoordinate(raw: string | null): number | null {
  if (!raw) return null;
  const value = parseFloat(raw);
  return Number.isFinite(value) ? value : null;
}
