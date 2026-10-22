import { z } from 'zod';

/**
 * Contracts for game notes (`/api/m/v1/games/:gameId/notes…`), shared by the
 * web server actions and the mobile routes through
 * `apps/web/src/lib/services/games/{load,save}-game-notes.ts`.
 *
 * A game has three kinds of notes: overall notes every team member reads,
 * coach-only notes, and per-player notes — a coach's assessment in six
 * categories plus the player's own self-reflection.
 */

export const GAME_NOTE_CATEGORIES = [
  { key: 'pitching', label: 'Pitching/Throwing' },
  { key: 'hitting', label: 'Hitting' },
  { key: 'fieldingCatching', label: 'Fielding / Catching' },
  { key: 'baserunning', label: 'Baserunning' },
  { key: 'athleticism', label: 'Athleticism' },
  { key: 'attitude', label: 'Attitude' },
] as const;

export type GameNoteCategory = (typeof GAME_NOTE_CATEGORIES)[number]['key'];

/** Generous, but bounded at the boundary. */
export const GAME_NOTE_MAX_LENGTH = 10_000;
const MAX_PLAYERS_PER_SAVE = 200;

const noteText = z.string().max(GAME_NOTE_MAX_LENGTH, 'Notes are too long.');

export const gamePlayerAssessmentSchema = z.object({
  pitching: noteText.nullable(),
  hitting: noteText.nullable(),
  fieldingCatching: noteText.nullable(),
  baserunning: noteText.nullable(),
  athleticism: noteText.nullable(),
  attitude: noteText.nullable(),
});
export type GamePlayerAssessment = z.infer<typeof gamePlayerAssessmentSchema>;

export const saveGameNotesInputSchema = z.object({
  gameId: z.string().uuid('Missing game ID.'),
  /** Omitted = leave unchanged. Blank clears. */
  overallNotes: noteText.optional(),
  coachNotes: noteText.optional(),
  /** Only the players whose assessment changed; each replaces that player's six categories. */
  players: z
    .array(z.object({ playerId: z.string().uuid('Invalid player.'), assessment: gamePlayerAssessmentSchema }))
    .max(MAX_PLAYERS_PER_SAVE, 'Too many players in one save.')
    .default([]),
});
export type SaveGameNotesInput = z.input<typeof saveGameNotesInputSchema>;

export const savePlayerGameNotesInputSchema = z.object({
  gameId: z.string().uuid('Missing game ID.'),
  playerId: z.string().uuid('Missing player ID.'),
  /** Blank clears. */
  playerNotes: noteText,
});
export type SavePlayerGameNotesInput = z.input<typeof savePlayerGameNotesInputSchema>;

export const gameNotesPlayerSchema = z.object({
  playerId: z.string(),
  name: z.string(),
  jerseyNumber: z.number().nullable(),
  assessment: gamePlayerAssessmentSchema,
  /** The player's own self-reflection. */
  selfNotes: z.string().nullable(),
  /** The viewer is this player and may edit `selfNotes`. */
  canEditSelfNotes: z.boolean(),
});
export type GameNotesPlayer = z.infer<typeof gameNotesPlayerSchema>;

/**
 * What the viewer may see. Coaches get every active player and the coach-only
 * notes; a player gets their own entry; a parent gets each linked child on the
 * team; any other member gets the overall notes alone.
 */
export const gameNotesResponseSchema = z.object({
  gameId: z.string(),
  view: z.enum(['coach', 'player', 'parent', 'member']),
  overallNotes: z.string().nullable(),
  /** Null unless `view` is `coach`. */
  coachNotes: z.string().nullable(),
  players: z.array(gameNotesPlayerSchema),
});
export type GameNotesResponse = z.infer<typeof gameNotesResponseSchema>;
