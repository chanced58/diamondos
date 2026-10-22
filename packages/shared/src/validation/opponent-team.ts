import { z } from 'zod';
import { opponentPlayerFields } from './opponent-lineup';

/**
 * Contracts for a team's opponent teams and their rosters, managed outside any
 * one game (the web /games/opponents pages): `GET|POST
 * /api/m/v1/teams/:teamId/opponent-teams` and `…/opponent-teams/:id` with
 * `/players`. Coaches only. Positions are `player_position` enum values.
 */

const teamId = z.string().uuid('Invalid team.');
const opponentTeamId = z.string().uuid('Missing opponent team.');

/** Blank → null, so a cleared field clears the column. */
const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} is too long.`)
    .nullable()
    .optional()
    .transform((value) => (value ? value : null));

const teamFields = {
  name: z.string().trim().min(1, 'Team name is required.').max(100, 'Team name is too long.'),
  abbreviation: optionalText(10, 'Abbreviation'),
  city: optionalText(80, 'City'),
  /** Two-letter state, e.g. "ID". */
  stateCode: optionalText(2, 'State'),
};

export const opponentTeamsInputSchema = z.object({ teamId });
export type OpponentTeamsInput = z.input<typeof opponentTeamsInputSchema>;

export const createOpponentTeamInputSchema = z.object({ teamId, ...teamFields });
export type CreateOpponentTeamInput = z.input<typeof createOpponentTeamInputSchema>;

export const updateOpponentTeamInputSchema = z.object({ opponentTeamId, ...teamFields });
export type UpdateOpponentTeamInput = z.input<typeof updateOpponentTeamInputSchema>;

export const opponentTeamIdInputSchema = z.object({ opponentTeamId });
export type OpponentTeamIdInput = z.input<typeof opponentTeamIdInputSchema>;

export const BATS = ['right', 'left', 'switch'] as const;
export const THROWS = ['right', 'left'] as const;

const handedness = {
  bats: z.enum(BATS).nullable().optional().transform((value) => value ?? null),
  throws: z.enum(THROWS).nullable().optional().transform((value) => value ?? null),
};

export const addOpponentTeamPlayerInputSchema = z.object({ opponentTeamId, ...opponentPlayerFields, ...handedness });
export type AddOpponentTeamPlayerInput = z.input<typeof addOpponentTeamPlayerInputSchema>;

export const updateOpponentTeamPlayerInputSchema = z.object({
  opponentTeamId,
  playerId: z.string().uuid('Missing player ID.'),
  ...opponentPlayerFields,
  ...handedness,
});
export type UpdateOpponentTeamPlayerInput = z.input<typeof updateOpponentTeamPlayerInputSchema>;

export const removeOpponentTeamPlayerInputSchema = z.object({ opponentTeamId, playerId: z.string().uuid('Missing player ID.') });
export type RemoveOpponentTeamPlayerInput = z.input<typeof removeOpponentTeamPlayerInputSchema>;

export const opponentTeamSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  abbreviation: z.string().nullable(),
  city: z.string().nullable(),
  stateCode: z.string().nullable(),
});
export type OpponentTeamSummary = z.infer<typeof opponentTeamSummarySchema>;

export const opponentTeamsResponseSchema = z.object({
  teamId: z.string(),
  /** By name, each with its active roster size. */
  opponentTeams: z.array(opponentTeamSummarySchema.extend({ playerCount: z.number().int().nonnegative() })),
});
export type OpponentTeamsResponse = z.infer<typeof opponentTeamsResponseSchema>;

export const opponentTeamPlayerSchema = z.object({
  id: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  jerseyNumber: z.string().nullable(),
  primaryPosition: z.string().nullable(),
  bats: z.string().nullable(),
  throws: z.string().nullable(),
});
export type OpponentTeamPlayer = z.infer<typeof opponentTeamPlayerSchema>;

export const opponentTeamDetailResponseSchema = z.object({
  team: opponentTeamSummarySchema,
  /** Active roster, by jersey number. */
  players: z.array(opponentTeamPlayerSchema),
  /** Games we've played against them (scored or not) — what a scouting card draws on. */
  priorGames: z.number().int().nonnegative(),
});
export type OpponentTeamDetailResponse = z.infer<typeof opponentTeamDetailResponseSchema>;
