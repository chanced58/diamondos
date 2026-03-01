'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { formatDate, formatTime } from '@baseball/shared';
import { postEventAlert } from '@/app/(app)/messages/notify';

const EVENT_TYPE_LABELS: Record<string, string> = {
  meeting:   'Team Meeting',
  scrimmage: 'Scrimmage',
  travel:    'Travel',
  other:     'Event',
};

export async function createTeamEventAction(_prevState: string | null, formData: FormData) {
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
  const location    = (formData.get('location') as string)?.trim() || null;
  const description = (formData.get('description') as string)?.trim() || null;

  // Structured address fields from AddressAutocomplete
  const address   = (formData.get('location_address') as string)   || null;
  const latRaw    = formData.get('location_latitude') as string;
  const lngRaw    = formData.get('location_longitude') as string;
  const placeId   = (formData.get('location_place_id') as string)  || null;
  const latitude  = latRaw  ? parseFloat(latRaw)  : null;
  const longitude = lngRaw  ? parseFloat(lngRaw)  : null;

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

  // Verify coach role
  const { data: membership } = await supabase
    .from('team_members')
    .select('role')
    .eq('team_id', teamId)
    .eq('user_id', user.id)
    .single();

  const isCoach =
    membership?.role === 'head_coach' ||
    membership?.role === 'assistant_coach' ||
    membership?.role === 'athletic_director';

  if (!isCoach) return 'Only coaches can create team events.';

  const { data: event, error } = await supabase
    .from('team_events')
    .insert({
      team_id:     teamId,
      title,
      event_type:  eventType,
      starts_at:   startsAt,
      ends_at:     endsAt,
      location,
      address,
      latitude,
      longitude,
      place_id:    placeId,
      description,
      created_by:  user.id,
    })
    .select()
    .single();

  if (error) return `Failed to create event: ${error.message}`;

  if (formData.get('notifyTeam') === 'on') {
    const typeLabel = EVENT_TYPE_LABELS[eventType] ?? 'Event';
    const locationSuffix = location ? ` @ ${location}` : '';
    const msg = `📢 ${typeLabel}: ${title} — ${formatDate(startsAt)} at ${formatTime(startsAt)}${locationSuffix}`;
    await postEventAlert(supabase, teamId, user.id, msg);
  }

  redirect(`/games/events/${event.id}`);
}
