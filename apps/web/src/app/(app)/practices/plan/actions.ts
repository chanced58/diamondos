'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { zonedDateTimeToUtc } from '@baseball/shared';
import { resolveGameTimeZone } from '@/lib/games/game-time-zone';
import { planPractice } from '@/lib/services/practices/plan-practice';

/** Plans a practice from the Plan practice form; a wrapper over the service `/api/m/v1` shares. */
export async function planPracticeAction(
  _prevState: string | null | undefined,
  formData: FormData,
): Promise<string | null> {
  const authClient = createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return 'Not authenticated — please log in again.';

  const teamId = formData.get('teamId') as string;
  const date = formData.get('date') as string;
  const time = (formData.get('time') as string) || '09:00';
  const durationRaw = formData.get('duration') as string;

  // Structured address fields from AddressAutocomplete
  const latRaw = formData.get('location_latitude') as string;
  const lngRaw = formData.get('location_longitude') as string;
  const latitude = latRaw ? parseFloat(latRaw) : null;
  const longitude = lngRaw ? parseFloat(lngRaw) : null;

  if (!teamId) return 'Missing team ID.';
  if (!date) return 'Practice date is required.';

  // The typed time is wall-clock at the venue (or in the coach's browser when
  // no venue was picked). This action runs in UTC, so never let `new Date()`
  // interpret it.
  const timeZone =
    resolveGameTimeZone({ latitude, longitude, browserTimeZone: formData.get('browserTimeZone') as string | null }) ?? 'UTC';
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
  const result = await planPractice(supabase, user.id, {
    teamId,
    scheduledAt,
    durationMinutes: durationRaw ? parseInt(durationRaw, 10) : null,
    location: formData.get('location'),
    address: formData.get('location_address'),
    latitude,
    longitude,
    placeId: formData.get('location_place_id'),
    plan: formData.get('plan'),
    drillIds: parseDrillIds(formData.get('drill_ids')),
  });
  if (!result.ok) return result.error;

  redirect(`/practices/${result.data.practiceId}`);
}

/** The picker's JSON list of drill ids; the service validates each one. */
function parseDrillIds(raw: FormDataEntryValue | null): unknown {
  if (typeof raw !== 'string' || !raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}
