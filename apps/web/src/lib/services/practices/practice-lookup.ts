import type { SupabaseClient } from '@supabase/supabase-js';
import { Feature, hasFeature } from '@baseball/shared';
import { resolveTeamTier } from '@/lib/team-tier';
import { serviceError, type ServiceResult } from '../result';

/**
 * Shared pieces of the practice services: the practice row an action
 * authorizes against, and the generic failure that keeps database detail
 * in the server log.
 */

export type PracticeRow = {
  id: string;
  team_id: string;
  scheduled_at: string;
  status: string;
  run_status: string;
  latitude: number | null;
  longitude: number | null;
};

/** The practice, or a not_found / failed result. Authorize against its real team, never one the caller names. */
export async function loadPracticeRow(
  db: SupabaseClient,
  service: string,
  practiceId: string,
  actorUserId: string,
): Promise<{ practice: PracticeRow } | { result: ServiceResult<never> }> {
  const { data, error } = await db
    .from('practices')
    .select('id, team_id, scheduled_at, status, run_status, latitude, longitude')
    .eq('id', practiceId)
    .maybeSingle();
  if (error) return { result: failed(service, practiceId, actorUserId, error) };
  if (!data) return { result: serviceError('not_found', 'Practice not found.') };
  return { practice: data as PracticeRow };
}

/**
 * Refuses a team whose plan lacks practice planning — the gate on the web
 * Practices area, which AI-drafted and prep practices belong to.
 */
export async function requirePracticePlanning(db: SupabaseClient, teamId: string): Promise<ServiceResult<never> | null> {
  const tier = await resolveTeamTier(db, teamId);
  return hasFeature(tier, Feature.PRACTICE_PLANNING) ? null : serviceError('forbidden', "Practice planning isn't on this team's plan.");
}

/** Logs the error with its context and returns the generic `failed` result, keeping database detail off the client. */
export function failed<T = never>(service: string, id: string, actorUserId: string, error: unknown): ServiceResult<T> {
  console.error(`[${service}] id=${id} actor=${actorUserId} failed:`, error);
  return serviceError('failed', 'Something went wrong. Please try again.');
}
