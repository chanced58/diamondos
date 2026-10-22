import { z } from 'zod';
import { PlayerPosition } from '../types/player';

/**
 * Contracts for a game's opponent team, roster and batting order
 * (`/api/m/v1/games/:gameId/opponent…`), shared by the web server actions and
 * the mobile routes through `apps/web/src/lib/services/opponent-lineup/`.
 * Positions are `player_position` enum values ('first_base'), never the UI
 * abbreviations.
 */

const gameId = z.string().uuid('Missing game ID.');
const position = z.nativeEnum(PlayerPosition).nullable();

export const saveOpponentTeamInputSchema = z.object({
  gameId,
  name: z.string().trim().min(1, 'Team name is required.').max(100, 'Team name is too long.'),
});
export type SaveOpponentTeamInput = z.input<typeof saveOpponentTeamInputSchema>;

const opponentPlayerFields = {
  firstName: z.string().trim().min(1, 'First and last name are required.').max(60, 'Name is too long.'),
  lastName: z.string().trim().min(1, 'First and last name are required.').max(60, 'Name is too long.'),
  /** Text: opponent jerseys arrive as "07", "00". Blank = none. */
  jerseyNumber: z
    .string()
    .trim()
    .max(4, 'Jersey number is too long.')
    .nullable()
    .optional()
    .transform((value) => (value ? value : null)),
  primaryPosition: position.optional().transform((value) => value ?? null),
};

export const addOpponentPlayerInputSchema = z.object({ gameId, ...opponentPlayerFields });
export type AddOpponentPlayerInput = z.input<typeof addOpponentPlayerInputSchema>;

export const updateOpponentPlayerInputSchema = z.object({
  gameId,
  playerId: z.string().uuid('Missing player ID.'),
  ...opponentPlayerFields,
});
export type UpdateOpponentPlayerInput = z.input<typeof updateOpponentPlayerInputSchema>;

export const removeOpponentPlayerInputSchema = z.object({ gameId, playerId: z.string().uuid('Missing player ID.') });
export type RemoveOpponentPlayerInput = z.input<typeof removeOpponentPlayerInputSchema>;

export const opponentLineupEntrySchema = z.object({
  opponentPlayerId: z.string().uuid('Invalid player.'),
  /** Null = bench. */
  battingOrder: z.number().int().min(1, 'Invalid batting order.').nullable(),
  startingPosition: position,
});
export type OpponentLineupEntry = z.infer<typeof opponentLineupEntrySchema>;

/** The whole order: it replaces what the game had. */
export const saveOpponentLineupInputSchema = z.object({
  gameId,
  entries: z.array(opponentLineupEntrySchema).max(60, 'Too many players.'),
});
export type SaveOpponentLineupInput = z.input<typeof saveOpponentLineupInputSchema>;

export const opponentRosterPlayerSchema = z.object({
  id: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  jerseyNumber: z.string().nullable(),
  primaryPosition: z.string().nullable(),
});
export type OpponentRosterPlayer = z.infer<typeof opponentRosterPlayerSchema>;

export const opponentLineupResponseSchema = z.object({
  gameId: z.string(),
  /** The game's typed opponent name — the default for a new team record. */
  opponentName: z.string().nullable(),
  opponentTeam: z.object({ id: z.string(), name: z.string() }).nullable(),
  /** The league/tournament batting-order cap. */
  maxBatters: z.number(),
  /** Active roster, by last name. */
  players: z.array(opponentRosterPlayerSchema),
  lineup: z.array(
    z.object({
      opponentPlayerId: z.string(),
      battingOrder: z.number().nullable(),
      startingPosition: z.string().nullable(),
    }),
  ),
});
export type OpponentLineupResponse = z.infer<typeof opponentLineupResponseSchema>;
