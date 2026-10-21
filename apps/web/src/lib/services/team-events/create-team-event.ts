import type { SupabaseClient } from '@supabase/supabase-js';
import { createTeamEventSchema, formatDate, formatTime, isCoachRole } from '@baseball/shared';
import { postEventAlert } from '@/app/(app)/messages/notify';
import { resolveGameTimeZone } from '@/lib/games/game-time-zone';
import { invalidInput, serviceError, serviceOk, type ServiceResult } from '../result';

const EVENT_TYPE_LABELS: Record<string, string> = {
  meeting:   'Team Meeting',
  scrimmage: 'Scrimmage',
  travel:    'Travel',
  other:     'Event',
};

/**
 * Creates a team event. Only active coaches (head/assistant coach, athletic
 * director) of the team may create one. With `notifyTeam`, the event is also
 * posted to the team's announcement channel.
 */
export async function createTeamEvent(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<{ eventId: string }>> {
  const parsed = createTeamEventSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const input = parsed.data;

  const { data: membership, error: membershipError } = await db
    .from('team_members')
    .select('role')
    .eq('team_id', input.teamId)
    .eq('user_id', actorUserId)
    .eq('is_active', true)
    .maybeSingle();

  // A failed lookup is a server fault, not a permission denial.
  if (membershipError) {
    console.error(`[createTeamEvent] team=${input.teamId} actor=${actorUserId} membership lookup failed:`, membershipError);
    return serviceError('failed', 'Failed to verify team membership.');
  }

  if (!membership || !isCoachRole(membership.role)) {
    return serviceError('forbidden', 'Only coaches can create team events.');
  }

  const { data: event, error } = await db
    .from('team_events')
    .insert({
      team_id:     input.teamId,
      title:       input.title,
      event_type:  input.eventType,
      starts_at:   input.startsAt,
      ends_at:     input.endsAt,
      location:    input.location,
      address:     input.address,
      latitude:    input.latitude,
      longitude:   input.longitude,
      place_id:    input.placeId,
      description: input.description,
      created_by:  actorUserId,
    })
    .select('id')
    .single();

  if (error || !event) {
    console.error(`[createTeamEvent] team=${input.teamId} actor=${actorUserId} insert failed:`, error);
    return serviceError('failed', `Failed to create event: ${error?.message ?? 'no row returned'}`);
  }

  if (input.notifyTeam) {
    // The server runs in UTC: word the time in the venue's zone, else the
    // submitter's, like game times (see GameTimeZone in CLAUDE.md).
    const timeZone = resolveGameTimeZone({
      latitude: input.latitude,
      longitude: input.longitude,
      browserTimeZone: input.timeZone,
    });
    const typeLabel = EVENT_TYPE_LABELS[input.eventType] ?? 'Event';
    const locationSuffix = input.location ? ` @ ${input.location}` : '';
    const msg = `📢 ${typeLabel}: ${input.title} — ${formatDate(input.startsAt, timeZone)} at ${formatTime(input.startsAt, timeZone)}${locationSuffix}`;
    // The event already exists: a failed announcement must not turn into an
    // error the client retries, which would create the event twice.
    try {
      await postEventAlert(db, input.teamId, actorUserId, msg);
    } catch (alertError) {
      console.error(`[createTeamEvent] event=${event.id} announcement failed:`, alertError);
    }
  }

  return serviceOk({ eventId: event.id as string });
}
