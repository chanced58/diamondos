import type { SupabaseClient } from '@supabase/supabase-js';
import {
  PracticeDrillDeficitPriority,
  PracticeDrillVisibility,
  createTeamDrillInputSchema,
  deleteTeamDrillInputSchema,
  drillDetailInputSchema,
  drillsListInputSchema,
  updateTeamDrillInputSchema,
  type CreateDrillInput,
  type DrillDetailResponse,
  type DrillsListResponse,
  type PracticeDrill,
} from '@baseball/shared';
import { createDrill, deleteDrill, getDrillById, listDrillDeficitTags, listDrills, updateDrill } from '@baseball/database';
import { checkCoachOnTeam } from '@/lib/practices/authz';
import { invalidInput, serviceError, serviceOk, type ServiceResult } from '../result';
import { resolveGameViewer } from '../games/authorize';
import { failed, requirePracticePlanning } from './practice-lookup';

/**
 * The drill library (the web /practices/drills pages), shared with the mobile
 * routes: the curated drills plus the team's own, on a plan with practice
 * planning. Team members browse; coaches of the owning team create, edit and
 * delete the team's drills (`checkCoachOnTeam`, as the web drill actions use).
 * Curated drills are never changed.
 */

/** The curated drills and the team's own, for a member of a team on a plan with practice planning. */
export async function listTeamDrills(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<DrillsListResponse>> {
  const parsed = drillsListInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { teamId } = parsed.data;

  const viewer = await resolveGameViewer(db, actorUserId, teamId);
  if (!viewer) return serviceError('not_found', 'Team not found.');
  const gate = await requirePracticePlanning(db, teamId);
  if (gate) return gate;

  try {
    // The same check the drill writes make (platform admins aren't team coaches), so the app never offers what the server refuses.
    const { isCoach } = await checkCoachOnTeam(db, actorUserId, teamId);
    return serviceOk({ teamId, isCoach, drills: await listDrills(db as never, teamId) });
  } catch (error) {
    return failed('listTeamDrills', teamId, actorUserId, error);
  }
}

/** A curated drill or one of the team's, with the deficits it works on for that team. */
export async function loadDrill(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<DrillDetailResponse>> {
  const parsed = drillDetailInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { teamId, drillId } = parsed.data;

  const viewer = await resolveGameViewer(db, actorUserId, teamId);
  if (!viewer) return serviceError('not_found', 'Drill not found.');
  const gate = await requirePracticePlanning(db, teamId);
  if (gate) return gate;

  try {
    const drill = await getDrillById(db as never, drillId);
    // Another team's drill is hidden, as if it didn't exist.
    if (!drill || (drill.visibility !== PracticeDrillVisibility.SYSTEM && drill.teamId !== teamId)) {
      return serviceError('not_found', 'Drill not found.');
    }
    const tags = await listDrillDeficitTags(db as never, drillId, teamId);
    const fixes = (priority: PracticeDrillDeficitPriority) =>
      tags.filter((t) => t.priority === priority).map((t) => ({ id: t.deficit.id, name: t.deficit.name }));
    // The same check the edit and delete make, so the app never offers what the server refuses.
    const canEdit = drill.visibility !== PracticeDrillVisibility.SYSTEM && (await checkCoachOnTeam(db, actorUserId, teamId)).isCoach;
    return serviceOk({
      drill,
      canEdit,
      fixes: { primary: fixes(PracticeDrillDeficitPriority.PRIMARY), secondary: fixes(PracticeDrillDeficitPriority.SECONDARY) },
    });
  } catch (error) {
    return failed('loadDrill', drillId, actorUserId, error);
  }
}

/** Adds a drill to the team's library, for a coach of the team. */
export async function createTeamDrill(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<{ drillId: string }>> {
  const parsed = createTeamDrillInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { teamId, drill } = parsed.data;

  const coach = await authorizeCoach(db, teamId, actorUserId, 'createTeamDrill');
  if (coach) return coach;

  try {
    const created = await createDrill(db as never, { teamId, ...drillColumns(drill), createdBy: actorUserId });
    return serviceOk({ drillId: created.id });
  } catch (error) {
    return failed('createTeamDrill', teamId, actorUserId, error);
  }
}

/** Replaces one of the team's drills' fields; curated drills and other teams' are refused. */
export async function updateTeamDrill(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<{ drillId: string }>> {
  const parsed = updateTeamDrillInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { drillId, drill } = parsed.data;

  const owned = await ownTeamDrill(db, drillId, actorUserId, 'updateTeamDrill');
  if ('result' in owned) return owned.result;

  try {
    await updateDrill(db as never, drillId, drillColumns(drill));
    return serviceOk({ drillId });
  } catch (error) {
    return failed('updateTeamDrill', drillId, actorUserId, error);
  }
}

/** Removes one of the team's drills; curated drills and other teams' are refused. */
export async function deleteTeamDrill(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<{ drillId: string }>> {
  const parsed = deleteTeamDrillInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { drillId } = parsed.data;

  const owned = await ownTeamDrill(db, drillId, actorUserId, 'deleteTeamDrill');
  if ('result' in owned) return owned.result;

  try {
    await deleteDrill(db as never, drillId);
    return serviceOk({ drillId });
  } catch (error) {
    return failed('deleteTeamDrill', drillId, actorUserId, error);
  }
}

/** Null when the actor coaches the team and its plan has practice planning; otherwise the refusal. */
async function authorizeCoach(db: SupabaseClient, teamId: string, actorUserId: string, service: string): Promise<ServiceResult<never> | null> {
  try {
    const check = await checkCoachOnTeam(db, actorUserId, teamId);
    if (!check.isCoach) return serviceError('forbidden', 'Only coaches on this team can perform this action.');
  } catch (error) {
    return failed(service, teamId, actorUserId, error);
  }
  return requirePracticePlanning(db, teamId);
}

/** The drill, when it is a team drill (never curated) of a team the actor coaches. */
async function ownTeamDrill(
  db: SupabaseClient,
  drillId: string,
  actorUserId: string,
  service: string,
): Promise<{ result: ServiceResult<never> } | { drill: PracticeDrill }> {
  let drill: PracticeDrill | null;
  try {
    drill = await getDrillById(db as never, drillId);
  } catch (error) {
    return { result: failed(service, drillId, actorUserId, error) };
  }
  if (!drill) return { result: serviceError('not_found', 'Drill not found.') };
  if (drill.visibility === PracticeDrillVisibility.SYSTEM || !drill.teamId) {
    return { result: serviceError('forbidden', 'Curated drills can’t be changed.') };
  }
  const refusal = await authorizeCoach(db, drill.teamId, actorUserId, service);
  return refusal ? { result: refusal } : { drill };
}

/** The drill columns from the validated form; blank text and links are left unset (cleared on an edit), as the web does. */
function drillColumns(drill: CreateDrillInput) {
  return {
    name: drill.name,
    description: drill.description || undefined,
    defaultDurationMinutes: drill.defaultDurationMinutes,
    skillCategories: drill.skillCategories,
    positions: drill.positions ?? [],
    ageLevels: drill.ageLevels ?? [],
    equipment: drill.equipment ?? [],
    fieldSpaces: drill.fieldSpaces ?? [],
    minPlayers: drill.minPlayers,
    maxPlayers: drill.maxPlayers,
    coachingPoints: drill.coachingPoints || undefined,
    tags: drill.tags ?? [],
    diagramUrl: drill.diagramUrl || undefined,
    videoUrl: drill.videoUrl || undefined,
  };
}
