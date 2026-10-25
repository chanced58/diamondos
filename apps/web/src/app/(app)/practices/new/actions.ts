'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { zonedDateTimeToUtc } from '@baseball/shared';
import { createServerClient } from '@/lib/supabase/server';
import { resolveGameTimeZone } from '@/lib/games/game-time-zone';
import { createPractice } from '@/lib/services/practices/practices';

export async function createPracticeAction(_prevState: string | null | undefined, formData: FormData) {
  const authClient = createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return 'Not authenticated — please log in again.';

  const teamId = formData.get('teamId') as string;
  const date = formData.get('date') as string;
  const time = (formData.get('time') as string) || '09:00';
  const durationRaw = formData.get('duration') as string;
  const latRaw = formData.get('location_latitude') as string;
  const lngRaw = formData.get('location_longitude') as string;

  if (!teamId) return 'Missing team ID.';
  if (!date) return 'Practice date is required.';

  const latitude = latRaw ? parseFloat(latRaw) : null;
  const longitude = lngRaw ? parseFloat(lngRaw) : null;
  const browserTimeZone = formData.get('browserTimeZone') as string | null;

  // The typed time is wall-clock at the venue (or in the coach's browser when
  // no venue was picked). This action runs in UTC, so never let `new Date()`
  // interpret it.
  const timeZone = resolveGameTimeZone({ latitude, longitude, browserTimeZone }) ?? 'UTC';
  let scheduledAt: string;
  try {
    scheduledAt = zonedDateTimeToUtc(date, time, timeZone);
  } catch {
    return 'Invalid practice date or time.';
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const result = await createPractice(supabase, user.id, {
    teamId,
    scheduledAt,
    durationMinutes: durationRaw ? parseInt(durationRaw, 10) : null,
    location: formData.get('location') as string | null,
    address: formData.get('location_address') as string | null,
    latitude,
    longitude,
    placeId: formData.get('location_place_id') as string | null,
    timeZone,
    notifyTeam: formData.get('notifyTeam') === 'on',
  });
  if (!result.ok) return result.error;

  redirect(`/practices/${result.data.practiceId}`);
}
