'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { getActiveTeam } from '@/lib/active-team';
import type { ServiceResult } from '@/lib/services/result';
import {
  createBooking,
  createFacility,
  deleteBooking,
  deleteFacility,
} from '@/lib/services/facilities/facilities';

/**
 * Facility and booking actions for the active team. Each is a thin wrapper
 * over `lib/services/facilities`, shared with the mobile app's
 * `/api/m/v1/teams/:teamId/facilities…` routes.
 */

function service() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function runForActiveTeam(
  run: (db: ReturnType<typeof service>, userId: string, teamId: string) => Promise<ServiceResult<unknown>>,
): Promise<string | null> {
  const auth = createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return 'Not authenticated.';
  const team = await getActiveTeam(auth, user.id);
  if (!team) return 'No active team.';

  const result = await run(service(), user.id, team.id);
  if (!result.ok) return result.error;

  revalidatePath('/schedule');
  return null;
}

export async function createFacilityAction(_prev: string | null | undefined, formData: FormData) {
  const capacityRaw = formData.get('capacity') as string | null;
  return runForActiveTeam((db, userId, teamId) =>
    createFacility(db, userId, {
      teamId,
      name: formData.get('name') ?? '',
      kind: formData.get('kind'),
      capacity: capacityRaw ? Number(capacityRaw) : null,
      notes: formData.get('notes'),
    }),
  );
}

export async function deleteFacilityAction(_prev: string | null | undefined, formData: FormData) {
  return runForActiveTeam((db, userId, teamId) =>
    deleteFacility(db, userId, { teamId, facilityId: formData.get('facilityId') }),
  );
}

export async function createBookingAction(_prev: string | null | undefined, formData: FormData) {
  const date = formData.get('date') as string | null;           // yyyy-mm-dd
  const startTime = formData.get('startTime') as string | null; // HH:mm
  const endTime = formData.get('endTime') as string | null;
  const tzOffset = (formData.get('tzOffset') as string) || '+00:00'; // ±HH:MM

  if (!date || !startTime || !endTime) return 'Missing required fields.';
  // tzOffset must match ±HH:MM. If it doesn't, fail rather than silently
  // interpreting the user's wall-clock time in the server's timezone.
  if (!/^[+-]\d{2}:\d{2}$/.test(tzOffset)) return 'Invalid timezone offset.';

  return runForActiveTeam((db, userId, teamId) =>
    createBooking(db, userId, {
      teamId,
      facilityId: formData.get('facilityId'),
      // The wall-clock time pinned to the browser's zone.
      startsAt: `${date}T${startTime}:00${tzOffset}`,
      endsAt: `${date}T${endTime}:00${tzOffset}`,
      title: formData.get('title') ?? '',
      notes: formData.get('notes'),
    }),
  );
}

export async function deleteBookingAction(_prev: string | null | undefined, formData: FormData) {
  return runForActiveTeam((db, userId, teamId) =>
    deleteBooking(db, userId, { teamId, bookingId: formData.get('bookingId') }),
  );
}
