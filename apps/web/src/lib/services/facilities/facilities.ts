import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createBookingInputSchema,
  createFacilityInputSchema,
  deleteBookingInputSchema,
  deleteFacilityInputSchema,
  facilityScheduleInputSchema,
  type Facility,
  type FacilityBooking,
  type FacilityScheduleResponse,
} from '@baseball/shared';
import { invalidInput, serviceError, serviceOk, type ServiceResult } from '../result';
import { resolveGameViewer } from '../games/authorize';

/**
 * A team's facilities and bookings — the web /schedule page. Any team member
 * reads the schedule; coaches (and platform admins) add and remove facilities
 * and bookings. Every write is scoped to the named team.
 */

const UNIQUE_VIOLATION = '23505';
const EXCLUSION_VIOLATION = '23P01';

async function authorizeCoach(db: SupabaseClient, actorUserId: string, teamId: string): Promise<ServiceResult<true>> {
  const viewer = await resolveGameViewer(db, actorUserId, teamId);
  if (!viewer?.isCoach) return serviceError('forbidden', 'Only coaches can manage facilities and bookings.');
  return serviceOk(true);
}

function writeFailed(service: string, teamId: string, actorUserId: string, error: { message?: string }) {
  console.error(`[${service}] team=${teamId} actor=${actorUserId} failed:`, error);
  return serviceError<never>('failed', 'Failed to save. Please try again.');
}

export async function loadFacilitySchedule(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<FacilityScheduleResponse>> {
  const parsed = facilityScheduleInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { teamId, from, to } = parsed.data;

  const viewer = await resolveGameViewer(db, actorUserId, teamId);
  if (!viewer) return serviceError('not_found', 'Team not found.');

  const { data: facilityRows, error: facilitiesError } = await db
    .from('facilities')
    .select('id, name, kind, capacity, notes, is_active')
    .eq('team_id', teamId)
    .order('name');
  if (facilitiesError) {
    console.error(`[loadFacilitySchedule] team=${teamId} actor=${actorUserId} facilities read failed:`, facilitiesError);
    return serviceError('failed', 'Failed to load facilities.');
  }

  const facilities: Facility[] = ((facilityRows ?? []) as Record<string, unknown>[]).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    kind: row.kind as Facility['kind'],
    capacity: (row.capacity as number | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    isActive: row.is_active as boolean,
  }));

  let bookings: FacilityBooking[] = [];
  if (facilities.length > 0) {
    const { data: bookingRows, error: bookingsError } = await db
      .from('facility_bookings')
      .select('id, facility_id, starts_at, ends_at, title, notes')
      .in('facility_id', facilities.map((facility) => facility.id))
      .gte('starts_at', from)
      .lt('starts_at', to)
      .order('starts_at');
    if (bookingsError) {
      console.error(`[loadFacilitySchedule] team=${teamId} actor=${actorUserId} bookings read failed:`, bookingsError);
      return serviceError('failed', 'Failed to load bookings.');
    }
    bookings = ((bookingRows ?? []) as Record<string, unknown>[]).map((row) => ({
      id: row.id as string,
      facilityId: row.facility_id as string,
      startsAt: row.starts_at as string,
      endsAt: row.ends_at as string,
      title: row.title as string,
      notes: (row.notes as string | null) ?? null,
    }));
  }

  return serviceOk({ teamId, canManage: viewer.isCoach, facilities, bookings });
}

export async function createFacility(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<{ facilityId: string }>> {
  const parsed = createFacilityInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { teamId, name, kind, capacity, notes } = parsed.data;

  const auth = await authorizeCoach(db, actorUserId, teamId);
  if (!auth.ok) return auth;

  const { data, error } = await db
    .from('facilities')
    .insert({ team_id: teamId, name, kind, capacity, notes, created_by: actorUserId })
    .select('id')
    .single();
  if (error?.code === UNIQUE_VIOLATION) {
    return serviceError('conflict', 'A facility with that name already exists for this team.');
  }
  if (error || !data) return writeFailed('createFacility', teamId, actorUserId, error ?? { message: 'no row returned' });

  return serviceOk({ facilityId: data.id as string });
}

export async function deleteFacility(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<{ facilityId: string }>> {
  const parsed = deleteFacilityInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { teamId, facilityId } = parsed.data;

  const auth = await authorizeCoach(db, actorUserId, teamId);
  if (!auth.ok) return auth;

  const { data, error } = await db
    .from('facilities')
    .delete()
    .eq('id', facilityId)
    .eq('team_id', teamId)
    .select('id');
  if (error) return writeFailed('deleteFacility', teamId, actorUserId, error);
  if (!data || data.length === 0) return serviceError('not_found', 'Facility not found on this team.');

  return serviceOk({ facilityId });
}

export async function createBooking(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<{ bookingId: string }>> {
  const parsed = createBookingInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { teamId, facilityId, startsAt, endsAt, title, notes } = parsed.data;

  const auth = await authorizeCoach(db, actorUserId, teamId);
  if (!auth.ok) return auth;

  const { data: facility, error: facilityError } = await db
    .from('facilities')
    .select('id')
    .eq('id', facilityId)
    .eq('team_id', teamId)
    .maybeSingle();
  if (facilityError) return writeFailed('createBooking', teamId, actorUserId, facilityError);
  if (!facility) return serviceError('not_found', 'Facility not found on this team.');

  const { data, error } = await db
    .from('facility_bookings')
    .insert({
      facility_id: facilityId,
      starts_at: new Date(startsAt).toISOString(),
      ends_at: new Date(endsAt).toISOString(),
      title,
      notes,
      created_by: actorUserId,
    })
    .select('id')
    .single();
  if (error?.code === EXCLUSION_VIOLATION || (error?.message && /overlap/i.test(error.message))) {
    return serviceError('conflict', 'Time conflict: another booking for this facility already overlaps this window.');
  }
  if (error || !data) return writeFailed('createBooking', teamId, actorUserId, error ?? { message: 'no row returned' });

  return serviceOk({ bookingId: data.id as string });
}

export async function deleteBooking(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<{ bookingId: string }>> {
  const parsed = deleteBookingInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { teamId, bookingId } = parsed.data;

  const auth = await authorizeCoach(db, actorUserId, teamId);
  if (!auth.ok) return auth;

  // The booking's facility must be the team's.
  const { data: booking, error: bookingError } = await db
    .from('facility_bookings')
    .select('id, facilities!inner(team_id)')
    .eq('id', bookingId)
    .eq('facilities.team_id', teamId)
    .maybeSingle();
  if (bookingError) return writeFailed('deleteBooking', teamId, actorUserId, bookingError);
  if (!booking) return serviceError('not_found', 'Booking not found.');

  const { error } = await db.from('facility_bookings').delete().eq('id', bookingId);
  if (error) return writeFailed('deleteBooking', teamId, actorUserId, error);

  return serviceOk({ bookingId });
}
