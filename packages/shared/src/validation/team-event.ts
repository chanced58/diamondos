import { z } from 'zod';
import { isValidTimeZone } from '../utils/date';

export const TEAM_EVENT_TYPES = ['meeting', 'scrimmage', 'travel', 'other'] as const;
export type TeamEventType = (typeof TEAM_EVENT_TYPES)[number];

/** Blank strings become null, so an empty optional field never saves as ''. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => (value ? value : null));

const isoDateTime = z.string().datetime({ offset: true });

/**
 * Input for creating a team event (meeting, scrimmage, travel…). Shared by
 * the web server action and `POST /api/m/v1/team-events`. Times are absolute
 * ISO-8601 instants: each client converts its own wall-clock input.
 */
export const createTeamEventSchema = z
  .object({
    teamId: z.string().uuid('Missing team ID.'),
    title: z.string().trim().min(1, 'Event title is required.').max(200),
    eventType: z.enum(TEAM_EVENT_TYPES).default('other'),
    startsAt: isoDateTime,
    endsAt: isoDateTime.nullish().transform((value) => value ?? null),
    location: optionalText(500),
    address: optionalText(500),
    latitude: z.number().min(-90).max(90).nullish().transform((value) => value ?? null),
    longitude: z.number().min(-180).max(180).nullish().transform((value) => value ?? null),
    placeId: optionalText(500),
    description: optionalText(5000),
    /**
     * IANA zone the submitter entered the times in (their device or browser).
     * Only used to word the announcement; the venue's zone wins when the
     * event has coordinates.
     */
    timeZone: z
      .string()
      .refine(isValidTimeZone, 'Unknown time zone.')
      .nullish()
      .transform((value) => value ?? null),
    /** Post the event to the team's announcement channel. */
    notifyTeam: z.boolean().default(false),
  })
  .refine((input) => !input.endsAt || Date.parse(input.endsAt) >= Date.parse(input.startsAt), {
    message: 'The event must end after it starts.',
    path: ['endsAt'],
  });

export type CreateTeamEventInput = z.input<typeof createTeamEventSchema>;
export type CreateTeamEventData = z.output<typeof createTeamEventSchema>;
