import { createTeamEventSchema, type CreateTeamEventInput, type TeamEventType } from '@baseball/shared';
import { localDateFromParts } from '../forms/date-parts';
import type { Venue } from '../places/VenueSearchField';

/**
 * The new-team-event form and its translation to the shared create input.
 * Unlike games, events travel as instants: the device converts its own wall
 * clock (as the web form does in the browser) and sends its zone so the
 * announcement reads in local time.
 */

export interface EventFormValues {
  title: string;
  eventType: TeamEventType;
  startDate: string;
  startTime: string;
  hasEnd: boolean;
  endDate: string;
  endTime: string;
  venue: Venue | null;
  description: string;
  notifyTeam: boolean;
}

export const EVENT_TYPE_LABELS: Record<TeamEventType, string> = {
  meeting: 'Team meeting',
  scrimmage: 'Scrimmage',
  travel: 'Travel',
  other: 'Event',
};

export function emptyEventFormValues(today: { date: string }): EventFormValues {
  return {
    title: '',
    eventType: 'meeting',
    startDate: today.date,
    startTime: '18:00',
    hasEnd: false,
    endDate: today.date,
    endTime: '19:00',
    venue: null,
    description: '',
    notifyTeam: false,
  };
}

export function teamEventInput(teamId: string, values: EventFormValues, timeZone: string | null): CreateTeamEventInput {
  return {
    teamId,
    title: values.title,
    eventType: values.eventType,
    startsAt: localDateFromParts(values.startDate, values.startTime).toISOString(),
    endsAt: values.hasEnd ? localDateFromParts(values.endDate, values.endTime).toISOString() : null,
    location: values.venue?.name.trim() || null,
    address: values.venue?.address ?? null,
    latitude: values.venue?.latitude ?? null,
    longitude: values.venue?.longitude ?? null,
    placeId: values.venue?.placeId ?? null,
    description: values.description,
    timeZone,
    notifyTeam: values.notifyTeam,
  };
}

/** The first problem the server would report, or null. */
export function validateEventForm(teamId: string, values: EventFormValues): string | null {
  const parsed = createTeamEventSchema.safeParse(teamEventInput(teamId, values, null));
  return parsed.success ? null : (parsed.error.issues[0]?.message ?? 'Check the event details.');
}
