import { z } from 'zod';
import { isValidTimeZone } from '../utils/date';
import { PRACTICE_REP_OUTCOMES, PracticeRepCoachTag } from '../types/practice-rep';

/**
 * Contracts for the practice-day actions the web does with the service role,
 * shared by the web server actions and the mobile routes
 * (`/api/m/v1/teams/:teamId/practices`, `/api/m/v1/practices/:id[/plan|notes|
 * self-notes|cancel|reps|run]`). Block and station structure editing stays on
 * the web.
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

/** The coach's per-player note categories, in the order the web shows them. */
export const PRACTICE_NOTE_CATEGORIES = [
  { key: 'pitching', label: 'Pitching/Throwing' },
  { key: 'hitting', label: 'Hitting' },
  { key: 'fielding_catching', label: 'Fielding / Catching' },
  { key: 'baserunning', label: 'Baserunning' },
  { key: 'athleticism', label: 'Athleticism' },
  { key: 'attitude', label: 'Attitude' },
] as const;
export type PracticeNoteCategory = (typeof PRACTICE_NOTE_CATEGORIES)[number]['key'];

// ─── Inputs ──────────────────────────────────────────────────────────────────

export const practicesListInputSchema = z.object({ teamId: uuid('Missing team.') });
export type PracticesListInput = z.input<typeof practicesListInputSchema>;

export const practiceIdInputSchema = z.object({ practiceId: uuid('Missing practice.') });
export type PracticeIdInput = z.input<typeof practiceIdInputSchema>;

/**
 * A new practice. `scheduledAt` is absolute (the client converts the typed
 * date and time); `timeZone` is only used to word the team announcement.
 */
export const createPracticeInputSchema = z.object({
  teamId: uuid('Missing team.'),
  scheduledAt: isoDateTime,
  durationMinutes: z.number().int().min(1).max(600).nullish().transform((value) => value ?? null),
  location: optionalText(500),
  address: optionalText(500),
  latitude: z.number().min(-90).max(90).nullish().transform((value) => value ?? null),
  longitude: z.number().min(-180).max(180).nullish().transform((value) => value ?? null),
  placeId: optionalText(500),
  timeZone: z.string().refine(isValidTimeZone, 'Unknown time zone.').nullish().transform((value) => value ?? null),
  /** Post the practice to the team's announcement channel. */
  notifyTeam: z.boolean().default(false),
});
export type CreatePracticeInput = z.input<typeof createPracticeInputSchema>;

export const cancelPracticeInputSchema = z.object({
  practiceId: uuid('Missing practice.'),
  notifyTeam: z.boolean().default(false),
  /** IANA zone to word the announcement in when the practice has no venue zone. */
  timeZone: z.string().refine(isValidTimeZone, 'Unknown time zone.').nullish().transform((value) => value ?? null),
});
export type CancelPracticeInput = z.input<typeof cancelPracticeInputSchema>;

export const savePracticePlanInputSchema = z.object({
  practiceId: uuid('Missing practice.'),
  plan: z.string().max(20000, 'The plan is too long.'),
});
export type SavePracticePlanInput = z.input<typeof savePracticePlanInputSchema>;

const categoryNotes = Object.fromEntries(
  PRACTICE_NOTE_CATEGORIES.map(({ key }) => [key, optionalText(5000)]),
) as Record<PracticeNoteCategory, ReturnType<typeof optionalText>>;

export const practicePlayerCoachNotesSchema = z.object({ playerId: uuid('Missing player.'), ...categoryNotes });

/**
 * Like optionalText, but a field left out stays undefined, so a save can
 * leave it alone; blank or null still clears it.
 */
const keptUnlessSent = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => (value === undefined ? undefined : value ? value : null));

/**
 * The coach's notes: overall (the team sees them), private coach notes, and
 * per-player notes. Overall and coach notes not sent are left as they are.
 */
export const savePracticeNotesInputSchema = z.object({
  practiceId: uuid('Missing practice.'),
  overallNotes: keptUnlessSent(20000),
  coachNotes: keptUnlessSent(20000),
  /** Only the players whose notes are being saved; others are left as they are. */
  players: z.array(practicePlayerCoachNotesSchema).max(200).default([]),
});
export type SavePracticeNotesInput = z.input<typeof savePracticeNotesInputSchema>;

/** A player's own reflection on a practice. */
export const savePracticeSelfNotesInputSchema = z.object({
  practiceId: uuid('Missing practice.'),
  playerId: uuid('Missing player.'),
  playerNotes: optionalText(5000),
});
export type SavePracticeSelfNotesInput = z.input<typeof savePracticeSelfNotesInputSchema>;

export const logPracticeRepInputSchema = z.object({
  practiceId: uuid('Missing practice.'),
  playerId: uuid('Pick a hitter.'),
  outcome: z.enum(PRACTICE_REP_OUTCOMES),
  coachTag: z.nativeEnum(PracticeRepCoachTag).nullish().transform((value) => value ?? null),
});
export type LogPracticeRepInput = z.input<typeof logPracticeRepInputSchema>;

export const runPracticeInputSchema = z.discriminatedUnion('action', [
  z.object({ practiceId: uuid('Missing practice.'), action: z.literal('start') }),
  z.object({ practiceId: uuid('Missing practice.'), action: z.literal('complete') }),
  z.object({ practiceId: uuid('Missing practice.'), action: z.literal('startBlock'), blockId: uuid('Missing block.') }),
  z.object({ practiceId: uuid('Missing practice.'), action: z.literal('skipBlock'), blockId: uuid('Missing block.') }),
  z.object({
    practiceId: uuid('Missing practice.'),
    action: z.literal('completeBlock'),
    blockId: uuid('Missing block.'),
    actualDurationMinutes: z.number().min(0).max(600),
  }),
]);
export type RunPracticeInput = z.input<typeof runPracticeInputSchema>;

// ─── Responses ───────────────────────────────────────────────────────────────

export const practiceSummarySchema = z.object({
  id: z.string(),
  scheduledAt: z.string(),
  durationMinutes: z.number().nullable(),
  location: z.string().nullable(),
  runStatus: z.string(),
  /** Linked to an upcoming game it prepares for. */
  isPrep: z.boolean(),
});
export type PracticeSummary = z.infer<typeof practiceSummarySchema>;

export const practicesListResponseSchema = z.object({
  teamId: z.string(),
  isCoach: z.boolean(),
  /** Not cancelled, oldest first. */
  practices: z.array(practiceSummarySchema),
});
export type PracticesListResponse = z.infer<typeof practicesListResponseSchema>;

const nullableText = z.string().nullable();

export const practicePlayerNotesSchema = z.object({
  pitching: nullableText,
  hitting: nullableText,
  fielding_catching: nullableText,
  baserunning: nullableText,
  athleticism: nullableText,
  attitude: nullableText,
  /** The player's own reflection. */
  playerNotes: nullableText,
});
export type PracticePlayerNotes = z.infer<typeof practicePlayerNotesSchema>;

export const practiceRosterPlayerSchema = z.object({
  id: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  jerseyNumber: z.number().nullable(),
});
export type PracticeRosterPlayer = z.infer<typeof practiceRosterPlayerSchema>;

const hitterSchema = z.object({
  playerId: z.string(),
  rank: z.number(),
  /** Hard-hit plus line-drive reps. */
  qualityReps: z.number(),
  totalReps: z.number(),
});

export const practiceDetailResponseSchema = z.object({
  practice: z.object({
    id: z.string(),
    teamId: z.string(),
    scheduledAt: z.string(),
    durationMinutes: z.number().nullable(),
    location: z.string().nullable(),
    address: z.string().nullable(),
    latitude: z.number().nullable(),
    longitude: z.number().nullable(),
    status: z.string(),
    runStatus: z.string(),
    plan: nullableText,
    prep: z.object({ opponentName: z.string(), scheduledAt: z.string(), focusSummary: nullableText }).nullable(),
  }),
  /** What the caller sees, as on the web page. */
  viewer: z.enum(['coach', 'player', 'parent', 'member']),
  overallNotes: nullableText,
  /** Coaches only. */
  coach: z
    .object({
      coachNotes: nullableText,
      players: z.array(practiceRosterPlayerSchema),
      playerNotes: z.record(z.string(), practicePlayerNotesSchema),
      /** Hitters ranked on the team's last 3 days of logged reps. */
      hitters: z.object({ totalReps: z.number(), hot: z.array(hitterSchema), cold: z.array(hitterSchema) }),
    })
    .nullable(),
  /** The player's own notes, or each linked child's for a parent. */
  myPlayers: z.array(
    z.object({
      playerId: z.string(),
      name: z.string(),
      notes: practicePlayerNotesSchema.nullable(),
      /** A player writes their own reflection; a parent only reads. */
      canEditSelfNotes: z.boolean(),
    }),
  ),
});
export type PracticeDetailResponse = z.infer<typeof practiceDetailResponseSchema>;

export const practiceRunBlockSchema = z.object({
  id: z.string(),
  position: z.number(),
  blockType: z.string(),
  title: z.string(),
  plannedDurationMinutes: z.number(),
  actualDurationMinutes: z.number().nullable(),
  status: z.string(),
  startedAt: nullableText,
  completedAt: nullableText,
  notes: nullableText,
  /** Head coaches and athletic directors run every block; an assistant only the ones assigned to them. */
  canControl: z.boolean(),
});
export type PracticeRunBlock = z.infer<typeof practiceRunBlockSchema>;

export const practiceRunResponseSchema = z.object({
  practice: z.object({
    id: z.string(),
    scheduledAt: z.string(),
    status: z.string(),
    runStatus: z.string(),
    startedAt: nullableText,
    completedAt: nullableText,
  }),
  /** Start and finish the whole practice: head coaches and athletic directors. */
  canRunPractice: z.boolean(),
  blocks: z.array(practiceRunBlockSchema),
});
export type PracticeRunResponse = z.infer<typeof practiceRunResponseSchema>;
