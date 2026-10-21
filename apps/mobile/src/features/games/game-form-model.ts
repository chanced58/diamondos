import {
  createGameInputSchema,
  utcToZonedDateTime,
  type GameDetailResponse,
  type GameVenueInput,
} from '@baseball/shared';

/**
 * The game form's state and its translation to the shared create/update
 * input. Pure, so prefill and validation are testable without rendering.
 *
 * Times stay as the coach typed them (a date and a wall-clock time); the
 * server works out the zone they mean — the venue's, else the game's saved
 * zone, else this device's.
 */

/** How the opponent is given: a team record, a typed name, or not known yet. */
export type OpponentMode = 'team' | 'name' | 'tbd';

export interface GameFormVenue {
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  placeId: string | null;
}

export interface GameFormValues {
  opponentMode: OpponentMode;
  opponentTeamId: string | null;
  /** The typed name, or the picked team's name. */
  opponentName: string;
  /** YYYY-MM-DD */
  date: string;
  /** HH:mm, 24-hour */
  time: string;
  locationType: 'home' | 'away' | 'neutral';
  neutralHomeTeam: 'us' | 'opponent';
  venue: GameFormVenue | null;
  notes: string;
  /** Create only: announce the game to the team. */
  notifyTeam: boolean;
}

export const DEFAULT_GAME_TIME = '16:00';

export function deviceTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    return null;
  }
}

/** A blank form for a new game on `now`'s local date. */
export function emptyGameFormValues(now: Date = new Date(), timeZone: string | null = deviceTimeZone()): GameFormValues {
  return {
    opponentMode: 'name',
    opponentTeamId: null,
    opponentName: '',
    date: utcToZonedDateTime(now, timeZone).date,
    time: DEFAULT_GAME_TIME,
    locationType: 'home',
    neutralHomeTeam: 'us',
    venue: null,
    notes: '',
    notifyTeam: false,
  };
}

/** The edit form prefilled from a game, its time shown in the game's own zone. */
export function gameFormValuesFromGame(
  game: GameDetailResponse['game'],
  fallbackTimeZone: string | null = deviceTimeZone(),
): GameFormValues {
  const { date, time } = utcToZonedDateTime(game.scheduledAt, game.timeZone ?? fallbackTimeZone);
  const opponentName = game.opponentName?.trim() ?? '';
  return {
    opponentMode: game.opponentTeamId ? 'team' : opponentName ? 'name' : 'tbd',
    opponentTeamId: game.opponentTeamId,
    opponentName,
    date,
    time,
    locationType: game.locationType,
    neutralHomeTeam: game.neutralHomeTeam ?? 'us',
    venue: game.venueName
      ? {
          name: game.venueName,
          address: game.venueAddress,
          latitude: game.latitude,
          longitude: game.longitude,
          placeId: game.placeId,
        }
      : null,
    notes: game.notes ?? '',
    notifyTeam: false,
  };
}

/** The shared input fields both create and update take. */
export function gameFormFields(values: GameFormValues, timeZone: string | null = deviceTimeZone()) {
  const tbd = values.opponentMode === 'tbd';
  const venue: GameVenueInput | null = values.venue?.name.trim() ? { ...values.venue, name: values.venue.name.trim() } : null;
  return {
    opponentTbd: tbd,
    opponentName: tbd ? null : values.opponentName.trim() || null,
    opponentTeamId: values.opponentMode === 'team' ? values.opponentTeamId : null,
    date: values.date,
    time: values.time,
    locationType: values.locationType,
    neutralHomeTeam: values.locationType === 'neutral' ? values.neutralHomeTeam : null,
    venue,
    notes: values.notes.trim() || null,
    deviceTimeZone: timeZone,
  };
}

/**
 * The first problem the server would report, checked on the device first so
 * the coach sees it without a round trip. Null when the form is valid.
 */
export function validateGameForm(values: GameFormValues): string | null {
  if (values.opponentMode === 'team' && !values.opponentTeamId) return 'Pick an opponent team.';
  const parsed = createGameInputSchema.safeParse({
    // Any well-formed id: only the form fields are being checked here.
    teamId: '00000000-0000-4000-8000-000000000000',
    ...gameFormFields(values),
  });
  return parsed.success ? null : (parsed.error.issues[0]?.message ?? 'Check the game details.');
}
