'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { getActiveTeam } from '@/lib/active-team';
import { getUserAccess } from '@/lib/user-access';

type FacilityKind = 'cage' | 'field' | 'bullpen' | 'gym' | 'classroom' | 'weight_room' | 'other';
const VALID_KINDS: FacilityKind[] = ['cage', 'field', 'bullpen', 'gym', 'classroom', 'weight_room', 'other'];

function service() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function coachOrFail(): Promise<{ userId: string; teamId: string } | string> {
  const auth = createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return 'Not authenticated.';
  const team = await getActiveTeam(auth, user.id);
  if (!team) return 'No active team.';
  const access = await getUserAccess(team.id, user.id);
  if (!access.isCoach) return 'Only coaches can manage facilities and bookings.';
  return { userId: user.id, teamId: team.id };
}

export async function createFacilityAction(_prev: string | null | undefined, formData: FormData) {
  const ctx = await coachOrFail();
  if (typeof ctx === 'string') return ctx;

  const name = (formData.get('name') as string)?.trim();
  const kind = formData.get('kind') as FacilityKind;
  const capacityRaw = formData.get('capacity') as string;
  const notes = (formData.get('notes') as string)?.trim() || null;

  if (!name) return 'Name is required.';
  if (!VALID_KINDS.includes(kind)) return 'Invalid facility kind.';
  const capacity = capacityRaw ? Number(capacityRaw) : null;
  if (capacity !== null && (!Number.isFinite(capacity) || capacity < 1)) return 'Capacity must be a positive number.';

  const { error } = await service().from('facilities').insert({
    team_id: ctx.teamId,
    name,
    kind,
    capacity,
    notes,
    created_by: ctx.userId,
  });

  if (error) {
    if (error.code === '23505') return 'A facility with that name already exists for this team.';
    return `Save failed: ${error.message}`;
  }

  revalidatePath('/schedule');
  return null;
}

export async function deleteFacilityAction(_prev: string | null | undefined, formData: FormData) {
  const ctx = await coachOrFail();
  if (typeof ctx === 'string') return ctx;
  const id = formData.get('facilityId') as string;
  if (!id) return 'Missing facility id.';

  const { error } = await service()
    .from('facilities')
    .delete()
    .eq('id', id)
    .eq('team_id', ctx.teamId);
  if (error) return `Delete failed: ${error.message}`;

  revalidatePath('/schedule');
  return null;
}

export async function createBookingAction(_prev: string | null | undefined, formData: FormData) {
  const ctx = await coachOrFail();
  if (typeof ctx === 'string') return ctx;

  const facilityId = formData.get('facilityId') as string;
  const date = formData.get('date') as string;      // yyyy-mm-dd
  const startTime = formData.get('startTime') as string; // HH:mm
  const endTime = formData.get('endTime') as string;
  const title = (formData.get('title') as string)?.trim();
  const notes = (formData.get('notes') as string)?.trim() || null;

  if (!facilityId || !date || !startTime || !endTime || !title) {
    return 'Missing required fields.';
  }

  const startsAt = new Date(`${date}T${startTime}`);
  const endsAt = new Date(`${date}T${endTime}`);
  if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime())) {
    return 'Invalid date/time.';
  }
  if (endsAt <= startsAt) return 'End time must be after start time.';

  // Confirm the facility belongs to this team before inserting.
  const sb = service();
  const { data: facility } = await sb
    .from('facilities')
    .select('id, team_id')
    .eq('id', facilityId)
    .maybeSingle();
  if (!facility || facility.team_id !== ctx.teamId) return 'Facility not found on this team.';

  const { error } = await sb.from('facility_bookings').insert({
    facility_id: facilityId,
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    title,
    notes,
    created_by: ctx.userId,
  });

  if (error) {
    if (error.code === '23P01' || /overlap/i.test(error.message)) {
      return 'Time conflict: another booking for this facility already overlaps this window.';
    }
    return `Booking failed: ${error.message}`;
  }

  revalidatePath('/schedule');
  return null;
}

export async function deleteBookingAction(_prev: string | null | undefined, formData: FormData) {
  const ctx = await coachOrFail();
  if (typeof ctx === 'string') return ctx;
  const id = formData.get('bookingId') as string;
  if (!id) return 'Missing booking id.';

  const sb = service();
  // Defensive: confirm the booking's facility belongs to this team.
  const { data: booking } = await sb
    .from('facility_bookings')
    .select('id, facilities!inner(team_id)')
    .eq('id', id)
    .maybeSingle();
  const row = booking as unknown as { id: string; facilities: { team_id: string } } | null;
  if (!row || row.facilities.team_id !== ctx.teamId) return 'Booking not found.';

  const { error } = await sb.from('facility_bookings').delete().eq('id', id);
  if (error) return `Delete failed: ${error.message}`;

  revalidatePath('/schedule');
  return null;
}
