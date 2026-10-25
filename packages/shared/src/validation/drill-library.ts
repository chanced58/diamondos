import { z } from 'zod';
import {
  PracticeAgeLevel,
  PracticeDrillVisibility,
  PracticeEquipment,
  PracticeFieldSpace,
  PracticeSkillCategory,
} from '../types/practice-drill';
import { createDrillSchema } from './practice-drill';

/**
 * Contracts for the drill library and planning a practice from drills,
 * shared by the web pages and actions and the mobile routes
 * (`/api/m/v1/teams/:teamId/drills`, `/api/m/v1/drills/:id`,
 * `/api/m/v1/teams/:teamId/practices/plan`). A drill's own fields are
 * validated with `createDrillSchema`.
 */

const uuid = (message: string) => z.string().uuid(message);
const isoDateTime = z.string().datetime({ offset: true });

/** Blank strings become null, so an empty optional field never saves as ''. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => (value ? value : null));

// ─── Inputs ──────────────────────────────────────────────────────────────────

export const drillsListInputSchema = z.object({ teamId: uuid('Missing team.') });
export type DrillsListInput = z.input<typeof drillsListInputSchema>;

/** A drill as the team sees it: the team decides which deficit tags apply and whether the coach may edit. */
export const drillDetailInputSchema = z.object({ teamId: uuid('Missing team.'), drillId: uuid('Missing drill.') });
export type DrillDetailInput = z.input<typeof drillDetailInputSchema>;

export const createTeamDrillInputSchema = z.object({ teamId: uuid('Missing team.'), drill: createDrillSchema });
export type CreateTeamDrillInput = z.input<typeof createTeamDrillInputSchema>;

/** Replaces a team drill's fields with the form's. */
export const updateTeamDrillInputSchema = z.object({ drillId: uuid('Missing drill.'), drill: createDrillSchema });
export type UpdateTeamDrillInput = z.input<typeof updateTeamDrillInputSchema>;

export const deleteTeamDrillInputSchema = z.object({ drillId: uuid('Missing drill.') });
export type DeleteTeamDrillInput = z.input<typeof deleteTeamDrillInputSchema>;

/**
 * A practice planned from drills (the web Plan practice form): each drill
 * becomes a block in the order given, and the plan text is saved as the
 * coach's notes. `scheduledAt` is absolute; the client converts the typed time.
 */
export const planPracticeInputSchema = z.object({
  teamId: uuid('Missing team.'),
  scheduledAt: isoDateTime,
  durationMinutes: z.number().int().min(1).max(600).nullish().transform((value) => value ?? null),
  location: optionalText(500),
  address: optionalText(500),
  latitude: z.number().min(-90).max(90).nullish().transform((value) => value ?? null),
  longitude: z.number().min(-180).max(180).nullish().transform((value) => value ?? null),
  placeId: optionalText(500),
  /** The coach's plan for the day; only coaches see it. */
  plan: optionalText(20000),
  drillIds: z
    .array(z.string().uuid('Unknown drill.'))
    .max(50, 'Pick at most 50 drills.')
    .default([])
    .transform((ids) => [...new Set(ids)]),
});
export type PlanPracticeInput = z.input<typeof planPracticeInputSchema>;

// ─── Responses ───────────────────────────────────────────────────────────────

/** `PracticeDrill` over the wire: optional fields are left out when unset. */
export const practiceDrillSchema = z.object({
  id: z.string(),
  teamId: z.string().nullable(),
  visibility: z.nativeEnum(PracticeDrillVisibility),
  name: z.string(),
  description: z.string().optional(),
  defaultDurationMinutes: z.number().optional(),
  skillCategories: z.array(z.nativeEnum(PracticeSkillCategory)),
  positions: z.array(z.string()),
  ageLevels: z.array(z.nativeEnum(PracticeAgeLevel)),
  equipment: z.array(z.nativeEnum(PracticeEquipment)),
  fieldSpaces: z.array(z.nativeEnum(PracticeFieldSpace)),
  minPlayers: z.number().optional(),
  maxPlayers: z.number().optional(),
  coachingPoints: z.string().optional(),
  tags: z.array(z.string()),
  diagramUrl: z.string().optional(),
  videoUrl: z.string().optional(),
  source: z.string().optional(),
  createdBy: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const drillsListResponseSchema = z.object({
  teamId: z.string(),
  /** Coaches add the team's own drills. */
  isCoach: z.boolean(),
  /** The curated library and the team's own drills, by name. */
  drills: z.array(practiceDrillSchema),
});
export type DrillsListResponse = z.infer<typeof drillsListResponseSchema>;

const deficitRefSchema = z.object({ id: z.string(), name: z.string() });

export const drillDetailResponseSchema = z.object({
  drill: practiceDrillSchema,
  /** A coach edits and deletes their team's own drills, never curated ones. */
  canEdit: z.boolean(),
  /** The deficits the drill works on, for this team. */
  fixes: z.object({ primary: z.array(deficitRefSchema), secondary: z.array(deficitRefSchema) }),
});
export type DrillDetailResponse = z.infer<typeof drillDetailResponseSchema>;
