import type { SupabaseClient } from '@supabase/supabase-js';
import { getNextGameForTeam, listPitchersWithUsage } from '@baseball/database';
import { bullpenInputSchema, utcToZonedDateTime, type BullpenResponse } from '@baseball/shared';
import { invalidInput, serviceError, serviceOk, type ServiceResult } from '../result';
import { resolveGameViewer } from '../games/authorize';

/**
 * The Bullpen Planner for the mobile app: every pitching candidate's
 * availability on a day, from the same query as the web planner. Coaches
 * only, like the web page.
 *
 * Without a requested date the plan is for the next game's day in the game's
 * time zone, else the device's `today` (UTC today when it sends none).
 */
export async function loadBullpenPlan(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<BullpenResponse>> {
  const parsed = bullpenInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { teamId, date, today } = parsed.data;

  const viewer = await resolveGameViewer(db, actorUserId, teamId);
  if (!viewer) return serviceError('not_found', 'Team not found.');
  if (!viewer.isCoach) return serviceError('forbidden', 'Only coaches can use the bullpen planner.');

  try {
    const target = date
      ? { date, dateSource: 'requested' as const }
      : await defaultPlanDate(db, teamId, today ?? new Date().toISOString().slice(0, 10));

    // listPitchersWithUsage reads the day as the UTC date of `asOfDate`; noon
    // UTC keeps that the requested day.
    const { rule, pitchers } = await listPitchersWithUsage(db as never, teamId, new Date(`${target.date}T12:00:00Z`));

    return serviceOk({
      teamId,
      ...target,
      rule: rule ? { ruleName: rule.ruleName, maxPitchesPerDay: rule.maxPitchesPerDay } : null,
      pitchers: pitchers.map(({ player, availability, eligibilitySource }) => ({
        playerId: player.id,
        firstName: player.firstName,
        lastName: player.lastName,
        jerseyNumber: player.jerseyNumber ?? null,
        throws: player.throws ?? null,
        eligibility: eligibilitySource,
        status: availability.status,
        pitchesLast7d: availability.pitchesLast7d,
        nextAvailableDate: availability.nextAvailableDate,
        remainingPitches: availability.remainingPitches ?? null,
        reason: availability.reason,
      })),
    });
  } catch (err) {
    console.error(`[loadBullpenPlan] team=${teamId} date=${date ?? 'default'} actor=${actorUserId} failed:`, err);
    return serviceError('failed', 'Failed to load the bullpen plan.');
  }
}

async function defaultPlanDate(
  db: SupabaseClient,
  teamId: string,
  today: string,
): Promise<Pick<BullpenResponse, 'date' | 'dateSource'>> {
  const nextGame = await getNextGameForTeam(db as never, teamId);
  if (!nextGame) return { date: today, dateSource: 'today' };
  // Unknown zone → UTC, so the server's own zone never decides the day.
  return { date: utcToZonedDateTime(nextGame.scheduledAt, nextGame.timeZone ?? 'UTC').date, dateSource: 'next_game' };
}
