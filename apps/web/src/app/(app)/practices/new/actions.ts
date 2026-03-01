'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { formatDate, formatTime } from '@baseball/shared';
import { postEventAlert } from '@/app/(app)/messages/notify';

export async function createPracticeAction(_prevState: string | null, formData: FormData) {
  const authClient = createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return 'Not authenticated — please log in again.';

  const teamId = formData.get('teamId') as string;
  const date = formData.get('date') as string;
  const time = (formData.get('time') as string) || '09:00';
  const location = (formData.get('location') as string) || null;
  const durationRaw = formData.get('duration') as string;
  const duration = durationRaw ? parseInt(durationRaw, 10) : null;

  // Structured address fields from AddressAutocomplete
  const address   = (formData.get('location_address') as string)   || null;
  const latRaw    = formData.get('location_latitude') as string;
  const lngRaw    = formData.get('location_longitude') as string;
  const placeId   = (formData.get('location_place_id') as string)  || null;
  const latitude  = latRaw  ? parseFloat(latRaw)  : null;
  const longitude = lngRaw  ? parseFloat(lngRaw)  : null;

  if (!teamId) return 'Missing team ID.';
  if (!date) return 'Practice date is required.';

  const scheduledAt = new Date(`${date}T${time}`).toISOString();

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Verify user is a coach on this team
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

  if (!isCoach) return 'Only coaches can log practices.';

  const { data: practice, error } = await supabase
    .from('practices')
    .insert({
      team_id: teamId,
      scheduled_at: scheduledAt,
      duration_minutes: duration,
      location,
      address,
      latitude,
      longitude,
      place_id: placeId,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) return `Failed to create practice: ${error.message}`;

  if (formData.get('notifyTeam') === 'on') {
    const locationSuffix = location ? ` @ ${location}` : '';
    const msg = `🏋️ Practice scheduled: ${formatDate(scheduledAt)} at ${formatTime(scheduledAt)}${locationSuffix}`;
    await postEventAlert(supabase, teamId, user.id, msg);
  }

  redirect(`/practices/${practice.id}`);
}
