import type { SupabaseClient } from '@supabase/supabase-js';
import {
  addInjuryFlagInputSchema,
  endInjuryFlagInputSchema,
  rosterPlayerIdInputSchema,
  type InjuryFlagWriteResponse,
  type PlayerAvailabilityResponse,
} from '@baseball/shared';
import { authorizeManagedPlayer } from './authorize-player';
import { invalidInput, serviceError, serviceOk, type ServiceResult } from '../result';

/**
 * A player's injury and availability flags (the web
 * /teams/:teamId/roster/:playerId/availability page), shared by its actions and
 * the mobile `/api/m/v1/teams/:teamId/players/:playerId/injury-flags` routes.
 * Roster managers only. Active flags keep contraindicated drills out of the AI
 * drill recommender.
 */

const UNIQUE_VIOLATION = '23505';

function failed<T>(action: string, playerId: string, actorUserId: string, error: unknown): ServiceResult<T> {
  console.error(`[injury-flags] ${action} failed player=${playerId} actor=${actorUserId}:`, error);
  return serviceError('failed', 'Something went wrong. Please try again.');
}

const authorizePlayer = (db: SupabaseClient, actorUserId: string, teamId: string, playerId: string) =>
  authorizeManagedPlayer(db, actorUserId, teamId, playerId, 'Only coaches can manage player availability.');

/** The injuries a team can flag: the system list and the team's own. `teamId` is a validated uuid. */
function catalogQuery(db: SupabaseClient, teamId: string, columns: string) {
  return db.from('injury_flag_catalog').select(columns).or(`visibility.eq.system,team_id.eq.${teamId}`);
}

export async function loadPlayerAvailability(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<PlayerAvailabilityResponse>> {
  const parsed = rosterPlayerIdInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { teamId, playerId } = parsed.data;

  const player = await authorizePlayer(db, actorUserId, teamId, playerId);
  if (!player.ok) return player;

  const [catalogResult, flagsResult] = await Promise.all([
    catalogQuery(db, teamId, 'slug, name, body_part, description').order('name'),
    db
      .from('player_injury_flags')
      .select('id, injury_slug, effective_from, effective_to, notes')
      .eq('player_id', playerId)
      .order('effective_from', { ascending: false }),
  ]);
  if (catalogResult.error) return failed('loadPlayerAvailability', playerId, actorUserId, catalogResult.error);
  if (flagsResult.error) return failed('loadPlayerAvailability', playerId, actorUserId, flagsResult.error);

  type CatalogRow = { slug: string; name: string; body_part: string; description: string | null };
  type FlagRow = { id: string; injury_slug: string; effective_from: string; effective_to: string | null; notes: string | null };
  return serviceOk({
    player: {
      id: player.data.id,
      firstName: player.data.first_name,
      lastName: player.data.last_name,
      jerseyNumber: player.data.jersey_number,
    },
    flags: ((flagsResult.data ?? []) as unknown as FlagRow[]).map((f) => ({
      id: f.id,
      injurySlug: f.injury_slug,
      effectiveFrom: f.effective_from,
      effectiveTo: f.effective_to,
      notes: f.notes,
    })),
    catalog: ((catalogResult.data ?? []) as unknown as CatalogRow[]).map((c) => ({
      slug: c.slug,
      name: c.name,
      bodyPart: c.body_part,
      description: c.description,
    })),
  });
}

/** Flags an injury from a date, open-ended or until an end date. One open-ended flag per injury. */
export async function addInjuryFlag(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<InjuryFlagWriteResponse>> {
  const parsed = addInjuryFlagInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { teamId, playerId, injurySlug, effectiveFrom, effectiveTo, notes } = parsed.data;

  const player = await authorizePlayer(db, actorUserId, teamId, playerId);
  if (!player.ok) return player;

  const { data: injury, error: catalogError } = await catalogQuery(db, teamId, 'slug').eq('slug', injurySlug).limit(1).maybeSingle();
  if (catalogError) return failed('addInjuryFlag', playerId, actorUserId, catalogError);
  if (!injury) return serviceError('invalid', 'Pick an injury from the list.');

  const { data, error } = await db
    .from('player_injury_flags')
    .insert({
      player_id: playerId,
      injury_slug: injurySlug,
      effective_from: effectiveFrom,
      effective_to: effectiveTo,
      notes,
      created_by: actorUserId,
    })
    .select('id')
    .single();
  if (error) {
    if ((error as { code?: string }).code === UNIQUE_VIOLATION) {
      return serviceError(
        'conflict',
        'This player already has an open-ended flag for that injury. End it first, or set an end date on the new flag.',
      );
    }
    return failed('addInjuryFlag', playerId, actorUserId, error);
  }
  return serviceOk({ flagId: (data as { id: string }).id });
}

/** Ends a flag on a date (the viewer's today, from the app or the web page). */
export async function endInjuryFlag(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<InjuryFlagWriteResponse>> {
  const parsed = endInjuryFlagInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { teamId, playerId, flagId, endDate } = parsed.data;

  const player = await authorizePlayer(db, actorUserId, teamId, playerId);
  if (!player.ok) return player;

  // Scoped to the authorized player, so a flag id from another team's player matches nothing.
  const { data: flag, error: readError } = await db
    .from('player_injury_flags')
    .select('id, effective_from, effective_to')
    .eq('id', flagId)
    .eq('player_id', playerId)
    .maybeSingle();
  if (readError) return failed('endInjuryFlag', playerId, actorUserId, readError);
  if (!flag) return serviceError('not_found', 'Flag not found on this player.');
  const current = flag as { effective_from: string; effective_to: string | null };
  if (endDate < current.effective_from) {
    return serviceError('invalid', 'End date must be on or after the start date.');
  }
  // Ending only ever shortens a flag: one that already ends by then is left as is,
  // so a retried or stale request can't bring an ended flag back.
  if (current.effective_to !== null && current.effective_to <= endDate) return serviceOk({ flagId });

  const { error } = await db.from('player_injury_flags').update({ effective_to: endDate }).eq('id', flagId).eq('player_id', playerId);
  if (error) return failed('endInjuryFlag', playerId, actorUserId, error);
  return serviceOk({ flagId });
}
