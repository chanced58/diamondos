import type { SupabaseClient } from '@supabase/supabase-js';
import {
  applyPracticeTemplateInputSchema,
  duplicatePracticeTemplateInputSchema,
  practiceTemplateIdInputSchema,
  practiceTemplatesInputSchema,
  type PracticeTemplatesResponse,
} from '@baseball/shared';
import { archiveTemplate, duplicateTemplate, instantiatePracticeFromTemplate, listTemplates } from '@baseball/database';
import { checkCoachOnTeam } from '@/lib/practices/authz';
import { invalidInput, serviceError, serviceOk, type ServiceResult } from '../result';
import { failed, loadPracticeRow } from './practice-lookup';

/**
 * Practice templates, shared by the web templates page, the plan editor and
 * the mobile routes: list, duplicate and archive (coaches of the template's
 * own team), and apply one to a practice, replacing its blocks (head coaches
 * and athletic directors, as for every structural change). Building and
 * editing a template stays on the web.
 */

/** The team's templates that aren't archived. */
export async function listPracticeTemplates(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<PracticeTemplatesResponse>> {
  const parsed = practiceTemplatesInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { teamId } = parsed.data;

  const role = await coachRole(db, teamId, actorUserId, 'listPracticeTemplates');
  if ('result' in role) return role.result;

  try {
    const templates = await listTemplates(db as never, teamId);
    return serviceOk({
      teamId,
      templates: templates.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description ?? null,
        kind: t.kind,
        seasonPhase: t.seasonPhase,
        defaultDurationMinutes: t.defaultDurationMinutes,
        isIndoorFallback: t.isIndoorFallback,
      })),
    });
  } catch (error) {
    return failed('listPracticeTemplates', teamId, actorUserId, error);
  }
}

export async function duplicatePracticeTemplate(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<{ templateId: string }>> {
  const parsed = duplicatePracticeTemplateInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { templateId, newName } = parsed.data;

  const template = await templateTeam(db, templateId, actorUserId, 'duplicatePracticeTemplate');
  if ('result' in template) return template.result;
  const role = await coachRole(db, template.teamId, actorUserId, 'duplicatePracticeTemplate');
  if ('result' in role) return role.result;

  try {
    const copy = await duplicateTemplate(db as never, templateId, newName, actorUserId);
    return serviceOk({ templateId: copy.id });
  } catch (error) {
    return failed('duplicatePracticeTemplate', templateId, actorUserId, error);
  }
}

export async function archivePracticeTemplate(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<{ templateId: string }>> {
  const parsed = practiceTemplateIdInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { templateId } = parsed.data;

  const template = await templateTeam(db, templateId, actorUserId, 'archivePracticeTemplate');
  if ('result' in template) return template.result;
  const role = await coachRole(db, template.teamId, actorUserId, 'archivePracticeTemplate');
  if ('result' in role) return role.result;

  try {
    await archiveTemplate(db as never, templateId, true);
    return serviceOk({ templateId });
  } catch (error) {
    return failed('archivePracticeTemplate', templateId, actorUserId, error);
  }
}

/** Replaces the practice's blocks with the template's; both must be the same team's. */
export async function applyPracticeTemplate(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<{ practiceId: string }>> {
  const parsed = applyPracticeTemplateInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { practiceId, templateId } = parsed.data;

  const lookup = await loadPracticeRow(db, 'applyPracticeTemplate', practiceId, actorUserId);
  if ('result' in lookup) return lookup.result;
  const teamId = lookup.practice.team_id;

  const role = await coachRole(db, teamId, actorUserId, 'applyPracticeTemplate');
  if ('result' in role) return role.result;
  if (role.role !== 'head_coach' && role.role !== 'athletic_director') {
    return serviceError('forbidden', 'Only head coaches or athletic directors can perform this action.');
  }

  const template = await templateTeam(db, templateId, actorUserId, 'applyPracticeTemplate');
  if ('result' in template) return template.result;
  if (template.teamId !== teamId) return serviceError('not_found', 'Template not found.');

  try {
    await instantiatePracticeFromTemplate(db as never, { practiceId, templateId });
    return serviceOk({ practiceId });
  } catch (error) {
    return failed('applyPracticeTemplate', practiceId, actorUserId, error);
  }
}

/** The actor's role when they coach the team (`checkCoachOnTeam`, as the web template actions use). */
async function coachRole(
  db: SupabaseClient,
  teamId: string,
  actorUserId: string,
  service: string,
): Promise<{ result: ServiceResult<never> } | { role: string | null }> {
  try {
    const check = await checkCoachOnTeam(db, actorUserId, teamId);
    if (!check.isCoach) return { result: serviceError('forbidden', 'Only coaches on this team can perform this action.') };
    return { role: check.role };
  } catch (error) {
    return { result: failed(service, teamId, actorUserId, error) };
  }
}

/** The template's own team, which every template action authorizes against. */
async function templateTeam(
  db: SupabaseClient,
  templateId: string,
  actorUserId: string,
  service: string,
): Promise<{ result: ServiceResult<never> } | { teamId: string }> {
  const { data, error } = await db.from('practice_templates').select('team_id').eq('id', templateId).maybeSingle();
  if (error) return { result: failed(service, templateId, actorUserId, error) };
  if (!data) return { result: serviceError('not_found', 'Template not found.') };
  return { teamId: data.team_id as string };
}
