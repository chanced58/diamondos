import { z } from 'zod';
import { PitcherAvailabilityStatus, PitcherEligibilitySource } from '../types/pitcher-availability';

/**
 * Contract for `GET /api/m/v1/teams/:teamId/bullpen?date=&today=` — the web
 * Bullpen Planner for coaches: each pitching candidate's availability on a
 * date under the team's pitch compliance rule. Without `date` the plan is for
 * the next game's local day, else the device's `today`.
 */

/** A real calendar day as YYYY-MM-DD: "2026-13-45" fails here, not as a 500 later. */
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a YYYY-MM-DD date.')
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, 'Use a real calendar date.');

export const bullpenInputSchema = z.object({
  teamId: z.string().uuid('Invalid team.'),
  date: isoDate.optional(),
  /** The device's local date, the fallback when there's no next game. */
  today: isoDate.optional(),
});
export type BullpenInput = z.infer<typeof bullpenInputSchema>;

export const bullpenPitcherSchema = z.object({
  playerId: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  jerseyNumber: z.number().int().nullable(),
  throws: z.string().nullable(),
  eligibility: z.nativeEnum(PitcherEligibilitySource),
  status: z.nativeEnum(PitcherAvailabilityStatus),
  pitchesLast7d: z.number().int().nonnegative(),
  /** YYYY-MM-DD; null when already available. */
  nextAvailableDate: z.string().nullable(),
  /** Pitches left before the next rest tier, when limited. */
  remainingPitches: z.number().int().nullable(),
  reason: z.string(),
});
export type BullpenPitcher = z.infer<typeof bullpenPitcherSchema>;

export const bullpenResponseSchema = z.object({
  teamId: z.string(),
  /** The day planned for, YYYY-MM-DD. */
  date: isoDate,
  /** Why that day: asked for, the next game's day, or today. */
  dateSource: z.enum(['requested', 'next_game', 'today']),
  /** Null → no active compliance rule; rest days can't be computed. */
  rule: z.object({ ruleName: z.string(), maxPitchesPerDay: z.number().int() }).nullable(),
  pitchers: z.array(bullpenPitcherSchema),
});
export type BullpenResponse = z.infer<typeof bullpenResponseSchema>;
