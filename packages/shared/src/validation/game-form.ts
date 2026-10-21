import { z } from 'zod';

/**
 * Contracts for creating and editing a game, shared by the web server actions
 * and `POST /api/m/v1/games` / `PATCH /api/m/v1/games/:gameId`.
 *
 * Times travel as the coach typed them — a calendar date and a wall-clock
 * time — never as an instant: the server resolves the zone they mean (the
 * venue's, else the game's saved zone, else the device's) and converts once.
 */

/** Blank strings become null, so an empty optional field never saves as ''. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => (value ? value : null));

const nullableNumber = (min: number, max: number) =>
  z.number().min(min).max(max).nullish().transform((value) => value ?? null);

export const GAME_LOCATION_TYPES = ['home', 'away', 'neutral'] as const;

/** A venue as picked from Places search, or typed by hand (no coordinates). */
export const gameVenueSchema = z.object({
  name: z.string().trim().min(1, 'Venue name is required.').max(300),
  address: optionalText(500),
  latitude: nullableNumber(-90, 90),
  longitude: nullableNumber(-180, 180),
  placeId: optionalText(500),
});
export type GameVenueInput = z.input<typeof gameVenueSchema>;

const gameFormFields = {
  /** The opponent isn't known yet (e.g. a bracket slot). */
  opponentTbd: z.boolean().default(false),
  opponentName: optionalText(200),
  /** An opponent team record picked from the team's or league's list. */
  opponentTeamId: z.string().uuid().nullish().transform((value) => value ?? null),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Game date is required.'),
  time: z.string().regex(/^\d{2}:\d{2}$/, 'Game time is invalid.').default('12:00'),
  locationType: z.enum(GAME_LOCATION_TYPES).default('home'),
  /** Only meaningful at a neutral site; ignored otherwise. */
  neutralHomeTeam: z.enum(['us', 'opponent']).nullish().transform((value) => value ?? null),
  venue: gameVenueSchema.nullish().transform((value) => value ?? null),
  notes: optionalText(2000),
  /** IANA zone of the device or browser the form was submitted from. */
  deviceTimeZone: optionalText(100),
};

const requireOpponent = <T extends { opponentTbd: boolean; opponentName: string | null }>(input: T) =>
  input.opponentTbd || Boolean(input.opponentName);
const OPPONENT_REQUIRED = { message: 'Opponent name is required.', path: ['opponentName'] };

export const createGameInputSchema = z
  .object({
    teamId: z.string().uuid('Missing team ID.'),
    tournamentId: z.string().uuid().nullish().transform((value) => value ?? null),
    /** Announce the new game in the team's announcement channel. */
    notifyTeam: z.boolean().default(false),
    ...gameFormFields,
  })
  .refine(requireOpponent, OPPONENT_REQUIRED);
export type CreateGameFormInput = z.input<typeof createGameInputSchema>;
export type CreateGameFormData = z.output<typeof createGameInputSchema>;

export const updateGameInputSchema = z
  .object({
    gameId: z.string().uuid('Missing game ID.'),
    ...gameFormFields,
  })
  .refine(requireOpponent, OPPONENT_REQUIRED);
export type UpdateGameFormInput = z.input<typeof updateGameInputSchema>;
export type UpdateGameFormData = z.output<typeof updateGameInputSchema>;

export const gameIdResultSchema = z.object({ gameId: z.string() });

/** The opponent teams a coach may pick for a game: the team's own plus its league's. */
export const gameFormOptionsSchema = z.object({
  opponentTeams: z.array(z.object({ id: z.string(), name: z.string(), city: z.string().nullable() })),
});
export type GameFormOptions = z.infer<typeof gameFormOptionsSchema>;

/** One Places autocomplete suggestion, already split into its two display lines. */
export const placePredictionSchema = z.object({
  placeId: z.string(),
  primaryText: z.string(),
  secondaryText: z.string().nullable(),
});
export const placeAutocompleteResponseSchema = z.object({
  predictions: z.array(placePredictionSchema),
});
export type PlacePrediction = z.infer<typeof placePredictionSchema>;

/** A picked place, in the shape a game's venue stores. */
export const placeDetailsSchema = z.object({
  placeId: z.string(),
  name: z.string(),
  address: z.string().nullable(),
  latitude: z.number(),
  longitude: z.number(),
});
export type PlaceDetails = z.infer<typeof placeDetailsSchema>;
