import { z } from 'zod';

/**
 * Contracts for a team's facilities (cages, fields, bullpens) and their
 * bookings (`/api/m/v1/teams/:teamId/facilities…`), shared by the web
 * schedule actions and the mobile routes through
 * `apps/web/src/lib/services/facilities/`. Two bookings on one facility can't
 * overlap — the database rejects it.
 */

export const FACILITY_KINDS = ['cage', 'field', 'bullpen', 'gym', 'classroom', 'weight_room', 'other'] as const;
export type FacilityKind = (typeof FACILITY_KINDS)[number];

export const FACILITY_KIND_LABELS: Record<FacilityKind, string> = {
  cage: 'Cage',
  field: 'Field',
  bullpen: 'Bullpen',
  gym: 'Gym',
  classroom: 'Classroom',
  weight_room: 'Weight room',
  other: 'Other',
};

/** The widest window one schedule read covers. */
export const FACILITY_SCHEDULE_MAX_DAYS = 42;

const teamId = z.string().uuid('Missing team ID.');
const instant = z.string().datetime({ offset: true, message: 'Invalid date/time.' });
const optionalNotes = z
  .string()
  .trim()
  .max(1000, 'Notes are too long.')
  .nullish()
  .transform((value) => value || null);

export const facilityScheduleInputSchema = z
  .object({ teamId, from: instant, to: instant })
  .refine((input) => Date.parse(input.to) > Date.parse(input.from), 'The window must end after it starts.')
  .refine(
    (input) => Date.parse(input.to) - Date.parse(input.from) <= FACILITY_SCHEDULE_MAX_DAYS * 86_400_000,
    'The window is too long.',
  );
export type FacilityScheduleInput = z.input<typeof facilityScheduleInputSchema>;

export const createFacilityInputSchema = z.object({
  teamId,
  name: z.string().trim().min(1, 'Name is required.').max(100, 'Name is too long.'),
  kind: z.enum(FACILITY_KINDS, { errorMap: () => ({ message: 'Invalid facility kind.' }) }),
  capacity: z.number().int('Capacity must be a whole number.').min(1, 'Capacity must be a positive number.').nullish().transform((value) => value ?? null),
  notes: optionalNotes,
});
export type CreateFacilityInput = z.input<typeof createFacilityInputSchema>;

export const deleteFacilityInputSchema = z.object({ teamId, facilityId: z.string().uuid('Missing facility ID.') });
export type DeleteFacilityInput = z.input<typeof deleteFacilityInputSchema>;

export const createBookingInputSchema = z
  .object({
    teamId,
    facilityId: z.string().uuid('Choose a facility.'),
    startsAt: instant,
    endsAt: instant,
    title: z.string().trim().min(1, 'Title is required.').max(200, 'Title is too long.'),
    notes: optionalNotes,
  })
  .refine((input) => Date.parse(input.endsAt) > Date.parse(input.startsAt), {
    message: 'End time must be after start time.',
    path: ['endsAt'],
  });
export type CreateBookingInput = z.input<typeof createBookingInputSchema>;

export const deleteBookingInputSchema = z.object({ teamId, bookingId: z.string().uuid('Missing booking ID.') });
export type DeleteBookingInput = z.input<typeof deleteBookingInputSchema>;

export const facilitySchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(FACILITY_KINDS),
  capacity: z.number().nullable(),
  notes: z.string().nullable(),
  isActive: z.boolean(),
});
export type Facility = z.infer<typeof facilitySchema>;

export const facilityBookingSchema = z.object({
  id: z.string(),
  facilityId: z.string(),
  startsAt: z.string(),
  endsAt: z.string(),
  title: z.string(),
  notes: z.string().nullable(),
});
export type FacilityBooking = z.infer<typeof facilityBookingSchema>;

export const facilityScheduleResponseSchema = z.object({
  teamId: z.string(),
  /** Coaches may add and remove facilities and bookings. */
  canManage: z.boolean(),
  /** Every facility, inactive ones included; book only active ones. */
  facilities: z.array(facilitySchema),
  /** Bookings starting in the window, by start time. */
  bookings: z.array(facilityBookingSchema),
});
export type FacilityScheduleResponse = z.infer<typeof facilityScheduleResponseSchema>;
