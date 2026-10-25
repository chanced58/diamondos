import { createPracticeInputSchema, planPracticeInputSchema, type CreatePracticeInput, type PlanPracticeInput } from '@baseball/shared';
import { localDateFromParts } from '../forms/date-parts';
import type { Venue } from '../places/VenueSearchField';

/**
 * The new-practice form and its translation to the shared create input. Like
 * team events, a practice travels as an instant: the device converts its own
 * wall clock and sends its zone so the announcement reads in local time.
 */

export interface PracticeFormValues {
  date: string;
  time: string;
  /** Minutes, as typed. */
  duration: string;
  venue: Venue | null;
  notifyTeam: boolean;
}

/** A new practice's defaults: today at 4:00 PM for two hours, no venue, no announcement. */
export function emptyPracticeFormValues(today: { date: string }): PracticeFormValues {
  return { date: today.date, time: '16:00', duration: '120', venue: null, notifyTeam: false };
}

/** The create request for the form's values, the typed wall clock converted on the device. */
export function practiceInput(teamId: string, values: PracticeFormValues, timeZone: string | null): CreatePracticeInput {
  const duration = values.duration.trim();
  return {
    teamId,
    scheduledAt: localDateFromParts(values.date, values.time).toISOString(),
    durationMinutes: duration ? Number(duration) : null,
    location: values.venue?.name.trim() || null,
    address: values.venue?.address ?? null,
    latitude: values.venue?.latitude ?? null,
    longitude: values.venue?.longitude ?? null,
    placeId: values.venue?.placeId ?? null,
    timeZone,
    notifyTeam: values.notifyTeam,
  };
}

/** The first problem the server would report, or null. */
export function validatePracticeForm(teamId: string, values: PracticeFormValues): string | null {
  const duration = values.duration.trim();
  if (duration && !/^\d+$/.test(duration)) return 'Duration must be a whole number of minutes.';
  const parsed = createPracticeInputSchema.safeParse(practiceInput(teamId, values, null));
  if (parsed.success) return null;
  const issue = parsed.error.issues[0];
  if (issue?.path[0] === 'durationMinutes') return 'Duration must be between 1 and 600 minutes.';
  return issue?.message ?? 'Check the practice details.';
}

/** A practice planned from drills: the form's when and where, the coach's plan, and the drills in order. */
export function planPracticeFields(
  values: PracticeFormValues,
  plan: string,
  drillIds: readonly string[],
): Omit<PlanPracticeInput, 'teamId'> {
  const practice = practiceInput('', values, null);
  return {
    scheduledAt: practice.scheduledAt,
    durationMinutes: practice.durationMinutes,
    location: practice.location,
    address: practice.address,
    latitude: practice.latitude,
    longitude: practice.longitude,
    placeId: practice.placeId,
    plan: plan.trim() || null,
    drillIds: [...drillIds],
  };
}

/** The first problem the server would report for a planned practice, or null. */
export function validatePlanForm(teamId: string, values: PracticeFormValues, plan: string, drillIds: readonly string[]): string | null {
  const problem = validatePracticeForm(teamId, values);
  if (problem) return problem;
  const parsed = planPracticeInputSchema.safeParse({ teamId, ...planPracticeFields(values, plan, drillIds) });
  if (parsed.success) return null;
  const issue = parsed.error.issues[0];
  if (issue?.path[0] === 'plan') return 'The plan must be 20,000 characters or fewer.';
  return issue?.message ?? 'Check the practice details.';
}
