import { z } from 'zod';
import { BatsThrows, PlayerPosition } from '../types/player';

/**
 * Contracts for managing a team's roster (the web /teams/:teamId/roster pages),
 * shared by the web actions and the mobile `/api/m/v1/teams/:teamId/players`
 * routes. Coaches add, edit, deactivate and reactivate players and keep their
 * injury and availability flags.
 */

const uuid = z.string().uuid();
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Dates must be YYYY-MM-DD.');
/** A blank optional field (null, undefined or '') reads as null. */
const blankToNull = (value: unknown) => (value === '' || value === undefined ? null : value);

/** Every editable field of a roster player. An edit replaces them all, as the web form does. */
export const rosterPlayerFieldsSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required').max(50),
  lastName: z.string().trim().min(1, 'Last name is required').max(50),
  jerseyNumber: z.preprocess(blankToNull, z.number().int().min(0, 'Jersey numbers run 0–99.').max(99, 'Jersey numbers run 0–99.').nullable()),
  primaryPosition: z.preprocess(blankToNull, z.nativeEnum(PlayerPosition).nullable()),
  secondaryPositions: z.array(z.nativeEnum(PlayerPosition)).max(Object.keys(PlayerPosition).length).default([]),
  bats: z.preprocess(blankToNull, z.nativeEnum(BatsThrows).nullable()),
  throws: z.preprocess(blankToNull, z.nativeEnum(BatsThrows).nullable()),
  graduationYear: z.preprocess(blankToNull, z.number().int().min(2000).max(2100).nullable()),
  email: z.preprocess(
    (value) => (typeof value === 'string' ? blankToNull(value.trim().toLowerCase()) : blankToNull(value)),
    z.string().email('Must be a valid email address').nullable(),
  ),
  phone: z.preprocess(
    (value) => (typeof value === 'string' ? blankToNull(value.trim()) : blankToNull(value)),
    z.string().max(30).nullable(),
  ),
});
export type RosterPlayerFields = z.infer<typeof rosterPlayerFieldsSchema>;
export type RosterPlayerFieldsInput = z.input<typeof rosterPlayerFieldsSchema>;

export const createRosterPlayerInputSchema = rosterPlayerFieldsSchema.extend({ teamId: uuid });
export type CreateRosterPlayerInput = z.input<typeof createRosterPlayerInputSchema>;

export const rosterPlayerIdInputSchema = z.object({ teamId: uuid, playerId: uuid });
export type RosterPlayerIdInput = z.infer<typeof rosterPlayerIdInputSchema>;

export const updateRosterPlayerInputSchema = rosterPlayerFieldsSchema.extend({ teamId: uuid, playerId: uuid });
export type UpdateRosterPlayerInput = z.input<typeof updateRosterPlayerInputSchema>;

/** Why a player left the active roster: removed from the list, or deactivated on their page. */
export const deactivateRosterPlayerInputSchema = rosterPlayerIdInputSchema.extend({
  reason: z.enum(['removed', 'deactivated']).default('deactivated'),
});
export type DeactivateRosterPlayerInput = z.input<typeof deactivateRosterPlayerInputSchema>;

export const reactivateRosterPlayerInputSchema = rosterPlayerIdInputSchema.extend({
  jerseyNumber: rosterPlayerFieldsSchema.shape.jerseyNumber.optional(),
});
export type ReactivateRosterPlayerInput = z.input<typeof reactivateRosterPlayerInputSchema>;

export const rosterPlayerSchema = z.object({
  id: z.string(),
  teamId: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  jerseyNumber: z.number().nullable(),
  primaryPosition: z.string().nullable(),
  secondaryPositions: z.array(z.string()),
  bats: z.string().nullable(),
  throws: z.string().nullable(),
  graduationYear: z.number().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  isActive: z.boolean(),
  disabledAt: z.string().nullable(),
});
export type RosterPlayer = z.infer<typeof rosterPlayerSchema>;

/** A player as their team sees them; `canManage` is whether the viewer may edit the roster. */
export const rosterPlayerResponseSchema = z.object({
  player: rosterPlayerSchema,
  canManage: z.boolean(),
});
export type RosterPlayerResponse = z.infer<typeof rosterPlayerResponseSchema>;

export const rosterPlayerWriteResponseSchema = z.object({ playerId: z.string() });
export type RosterPlayerWriteResponse = z.infer<typeof rosterPlayerWriteResponseSchema>;

/** Adding a player with an email also emails them an invite to the team. */
export const createRosterPlayerResponseSchema = rosterPlayerWriteResponseSchema.extend({ invited: z.boolean() });
export type CreateRosterPlayerResponse = z.infer<typeof createRosterPlayerResponseSchema>;

// ── Injury and availability flags ────────────────────────────────────────────

export const addInjuryFlagInputSchema = rosterPlayerIdInputSchema
  .extend({
    injurySlug: z.string().trim().min(1, 'Pick an injury.').max(100),
    effectiveFrom: ymd,
    effectiveTo: z.preprocess(blankToNull, ymd.nullable()),
    notes: z.preprocess(
      (value) => (typeof value === 'string' ? blankToNull(value.trim()) : blankToNull(value)),
      z.string().max(1000).nullable(),
    ),
  })
  .refine((flag) => !flag.effectiveTo || flag.effectiveTo >= flag.effectiveFrom, {
    message: 'End date must be on or after start date.',
    path: ['effectiveTo'],
  });
export type AddInjuryFlagInput = z.input<typeof addInjuryFlagInputSchema>;

export const endInjuryFlagInputSchema = rosterPlayerIdInputSchema.extend({ flagId: uuid, endDate: ymd });
export type EndInjuryFlagInput = z.infer<typeof endInjuryFlagInputSchema>;

export const injuryFlagSchema = z.object({
  id: z.string(),
  injurySlug: z.string(),
  effectiveFrom: z.string(),
  effectiveTo: z.string().nullable(),
  notes: z.string().nullable(),
});
export type InjuryFlag = z.infer<typeof injuryFlagSchema>;

export const injuryCatalogEntrySchema = z.object({
  slug: z.string(),
  name: z.string(),
  bodyPart: z.string(),
  description: z.string().nullable(),
});
export type InjuryCatalogEntry = z.infer<typeof injuryCatalogEntrySchema>;

/** A player's flags, newest first, and the injuries a coach can flag (the system list and the team's own). */
export const playerAvailabilityResponseSchema = z.object({
  player: z.object({
    id: z.string(),
    firstName: z.string(),
    lastName: z.string(),
    jerseyNumber: z.number().nullable(),
  }),
  flags: z.array(injuryFlagSchema),
  catalog: z.array(injuryCatalogEntrySchema),
});
export type PlayerAvailabilityResponse = z.infer<typeof playerAvailabilityResponseSchema>;

export const injuryFlagWriteResponseSchema = z.object({ flagId: z.string() });
export type InjuryFlagWriteResponse = z.infer<typeof injuryFlagWriteResponseSchema>;

/**
 * Flags as of `today` (YYYY-MM-DD, the viewer's local day): active ones cover
 * today, upcoming ones start later, past ones ended before it.
 */
export function partitionInjuryFlags<T extends { effectiveFrom: string; effectiveTo: string | null }>(
  flags: readonly T[],
  today: string,
): { active: T[]; upcoming: T[]; past: T[] } {
  return {
    active: flags.filter((f) => f.effectiveFrom <= today && (!f.effectiveTo || f.effectiveTo >= today)),
    upcoming: flags.filter((f) => f.effectiveFrom > today),
    past: flags.filter((f) => f.effectiveTo !== null && f.effectiveTo < today),
  };
}
