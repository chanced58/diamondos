import type { SupabaseClient } from '@supabase/supabase-js';
import {
  Feature,
  cancelPracticeInputSchema,
  createPracticeInputSchema,
  formatDate,
  formatTime,
  hasFeature,
  practicesListInputSchema,
  type PracticesListResponse,
} from '@baseball/shared';
import { postEventAlert } from '@/app/(app)/messages/notify';
import { resolveGameTimeZone } from '@/lib/games/game-time-zone';
import { resolveTeamTier } from '@/lib/team-tier';
import { invalidInput, serviceError, serviceOk, type ServiceResult } from '../result';
import { resolveGameViewer } from '../games/authorize';
import { failed, loadPracticeRow } from './practice-lookup';

/**
 * The team's practices, and creating and cancelling one — the web Practices
 * list, Log practice form and the practice page's Cancel. Shared with the
 * mobile `/api/m/v1` routes. Coaches are active head/assistant coaches and
 * athletic directors, and platform admins (`resolveGameViewer`).
 */

/** Every practice that isn't cancelled, oldest first, on a plan with practice planning (as the web list is). */
export async function listPractices(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<PracticesListResponse>> {
  const parsed = practicesListInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { teamId } = parsed.data;

  const [viewer, tier] = await Promise.all([resolveGameViewer(db, actorUserId, teamId), resolveTeamTier(db, teamId)]);
  if (!viewer) return serviceError('not_found', 'Team not found.');
  if (!hasFeature(tier, Feature.PRACTICE_PLANNING)) {
    return serviceError('forbidden', "Practice planning isn't on this team's plan.");
  }

  const { data, error } = await db
    .from('practices')
    .select('id, scheduled_at, duration_minutes, location, run_status, linked_game_id')
    .eq('team_id', teamId)
    .neq('status', 'cancelled')
    .order('scheduled_at', { ascending: true });
  if (error) return failed('listPractices', teamId, actorUserId, error);

  return serviceOk({
    teamId,
    isCoach: viewer.isCoach,
    practices: (data ?? []).map((row) => ({
      id: row.id as string,
      scheduledAt: row.scheduled_at as string,
      durationMinutes: (row.duration_minutes as number | null) ?? null,
      location: (row.location as string | null) ?? null,
      runStatus: row.run_status as string,
      isPrep: row.linked_game_id != null,
    })),
  });
}

/** Logs a practice for a coach of the team, announcing it when asked. Not plan-gated: the web schedule lets every coach log one. */
export async function createPractice(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<{ practiceId: string }>> {
  const parsed = createPracticeInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const input = parsed.data;

  const viewer = await resolveGameViewer(db, actorUserId, input.teamId);
  if (!viewer?.isCoach) return serviceError('forbidden', 'Only coaches can log practices.');

  const { data: practice, error } = await db
    .from('practices')
    .insert({
      team_id: input.teamId,
      scheduled_at: input.scheduledAt,
      duration_minutes: input.durationMinutes,
      location: input.location,
      address: input.address,
      latitude: input.latitude,
      longitude: input.longitude,
      place_id: input.placeId,
      created_by: actorUserId,
    })
    .select('id')
    .single();
  if (error || !practice) return failed('createPractice', input.teamId, actorUserId, error);

  if (input.notifyTeam) {
    const timeZone = announcementTimeZone(input.latitude, input.longitude, input.timeZone);
    const locationSuffix = input.location ? ` @ ${input.location}` : '';
    await announce(
      db,
      input.teamId,
      actorUserId,
      `🏋️ Practice scheduled: ${formatDate(input.scheduledAt, timeZone)} at ${formatTime(input.scheduledAt, timeZone)}${locationSuffix}`,
      'createPractice',
    );
  }

  return serviceOk({ practiceId: practice.id as string });
}

/** Cancels a practice for a coach of its own team, announcing it when asked; cancelling twice is a no-op. */
export async function cancelPractice(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<{ practiceId: string }>> {
  const parsed = cancelPracticeInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { practiceId, notifyTeam, timeZone } = parsed.data;

  const lookup = await loadPracticeRow(db, 'cancelPractice', practiceId, actorUserId);
  if ('result' in lookup) return lookup.result;
  const { practice } = lookup;

  const viewer = await resolveGameViewer(db, actorUserId, practice.team_id);
  if (!viewer?.isCoach) return serviceError('forbidden', 'Only coaches can cancel practices.');
  if (practice.status === 'cancelled') return serviceOk({ practiceId });

  const { error } = await db
    .from('practices')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', practiceId);
  if (error) return failed('cancelPractice', practiceId, actorUserId, error);

  if (notifyTeam) {
    const zone = announcementTimeZone(practice.latitude, practice.longitude, timeZone);
    await announce(
      db,
      practice.team_id,
      actorUserId,
      `❌ Practice on ${formatDate(practice.scheduled_at, zone)} has been cancelled.`,
      'cancelPractice',
    );
  }

  return serviceOk({ practiceId });
}

/** The server runs in UTC: word times in the venue's zone, else the submitter's (see GameTimeZone in CLAUDE.md). */
function announcementTimeZone(latitude: number | null, longitude: number | null, browserTimeZone: string | null) {
  return resolveGameTimeZone({ latitude, longitude, browserTimeZone }) ?? undefined;
}

/** The practice change already happened: a failed announcement must not become an error the client retries. */
async function announce(db: SupabaseClient, teamId: string, actorUserId: string, message: string, service: string) {
  try {
    await postEventAlert(db, teamId, actorUserId, message);
  } catch (alertError) {
    console.error(`[${service}] team=${teamId} announcement failed:`, alertError);
  }
}
