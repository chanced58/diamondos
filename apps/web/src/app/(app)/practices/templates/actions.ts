'use server';

import { createServerClient } from '@/lib/supabase/server';
import {
  PracticeBlockType,
  PracticeFieldSpace,
  PracticeSeasonPhase,
  PracticeTemplateKind,
  createTemplateWithBlocksSchema,
  templateBlockSchema,
} from '@baseball/shared';
import {
  createTemplateWithBlocks,
  replaceTemplateBlocks,
  updateTemplate,
} from '@baseball/database';
import { archivePracticeTemplate, duplicatePracticeTemplate } from '@/lib/services/practices/practice-templates';
import {
  assertCoachOnTeam,
  createPracticeServiceClient,
} from '@/lib/practices/authz';

type SaveResult = { error?: string; templateId?: string };

export interface SaveTemplateInput {
  mode: 'create' | 'edit';
  teamId: string;
  id?: string;
  name: string;
  description?: string;
  kind: PracticeTemplateKind;
  seasonPhase: PracticeSeasonPhase;
  defaultDurationMinutes: number;
  isIndoorFallback: boolean;
  pairedTemplateId?: string;
  blocks: Array<{
    position: number;
    blockType: PracticeBlockType;
    title: string;
    durationMinutes: number;
    drillId?: string;
    fieldSpaces: PracticeFieldSpace[];
    notes?: string;
  }>;
}

export async function saveTemplateAction(input: SaveTemplateInput): Promise<SaveResult> {
  const auth = createServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) return { error: 'Not authenticated.' };

  const supabase = createPracticeServiceClient();

  // For edits, authorize against the template's ACTUAL team_id — not
  // input.teamId, which a malicious caller could fabricate. This prevents
  // a coach on team A from mutating a template owned by team B.
  let effectiveTeamId = input.teamId;
  if (input.mode === 'edit') {
    if (!input.id) return { error: 'Missing template id.' };
    const { data: tplRow } = await supabase
      .from('practice_templates')
      .select('team_id')
      .eq('id', input.id)
      .maybeSingle();
    if (!tplRow) return { error: 'Template not found.' };
    effectiveTeamId = tplRow.team_id as string;
  }

  try {
    await assertCoachOnTeam(supabase, user.id, effectiveTeamId);
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Not authorized.' };
  }

  const parsedBlocks = input.blocks.map((b, i) => {
    const p = templateBlockSchema.safeParse({ ...b, position: i });
    return p;
  });
  const firstErr = parsedBlocks.find((p) => !p.success);
  if (firstErr && !firstErr.success) {
    return { error: firstErr.error.issues[0]?.message ?? 'Invalid block.' };
  }

  const payload = {
    name: input.name,
    description: input.description,
    kind: input.kind,
    seasonPhase: input.seasonPhase,
    defaultDurationMinutes: input.defaultDurationMinutes,
    isIndoorFallback: input.isIndoorFallback,
    pairedTemplateId: input.pairedTemplateId,
    blocks: input.blocks.map((b, i) => ({ ...b, position: i })),
  };
  const parsed = createTemplateWithBlocksSchema.safeParse(payload);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid template.' };
  }

  try {
    if (input.mode === 'create') {
      const created = await createTemplateWithBlocks(supabase, {
        template: {
          teamId: effectiveTeamId,
          name: parsed.data.name,
          description: parsed.data.description,
          kind: parsed.data.kind,
          seasonPhase: parsed.data.seasonPhase,
          defaultDurationMinutes: parsed.data.defaultDurationMinutes,
          isIndoorFallback: parsed.data.isIndoorFallback,
          pairedTemplateId: parsed.data.pairedTemplateId,
          createdBy: user.id,
        },
        blocks: parsed.data.blocks,
      });
      return { templateId: created.id };
    }

    // input.id already validated above for edit mode.
    if (!input.id) return { error: 'Missing template id.' };
    await updateTemplate(supabase, input.id, {
      name: parsed.data.name,
      description: parsed.data.description,
      kind: parsed.data.kind,
      seasonPhase: parsed.data.seasonPhase,
      defaultDurationMinutes: parsed.data.defaultDurationMinutes,
      isIndoorFallback: parsed.data.isIndoorFallback,
      pairedTemplateId: parsed.data.pairedTemplateId,
    });
    await replaceTemplateBlocks(supabase, input.id, parsed.data.blocks);
    return { templateId: input.id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to save template.' };
  }
}

/** Copies a template under a new name; a wrapper over the service `/api/m/v1` shares. */
export async function duplicateTemplateAction(args: {
  sourceTemplateId: string;
  teamId: string;
  newName: string;
}): Promise<SaveResult> {
  const auth = createServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) return { error: 'Not authenticated.' };

  const result = await duplicatePracticeTemplate(createPracticeServiceClient(), user.id, {
    templateId: args.sourceTemplateId,
    newName: args.newName,
  });
  return result.ok ? { templateId: result.data.templateId } : { error: result.error };
}

/** Archives a template; a wrapper over the service `/api/m/v1` shares. */
export async function archiveTemplateAction(args: {
  id: string;
  teamId: string;
}): Promise<SaveResult> {
  const auth = createServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) return { error: 'Not authenticated.' };

  const result = await archivePracticeTemplate(createPracticeServiceClient(), user.id, { templateId: args.id });
  return result.ok ? {} : { error: result.error };
}
