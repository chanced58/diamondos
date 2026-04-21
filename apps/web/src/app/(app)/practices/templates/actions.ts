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
  archiveTemplate,
  createTemplateWithBlocks,
  duplicateTemplate,
  replaceTemplateBlocks,
  updateTemplate,
} from '@baseball/database';
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
  try {
    await assertCoachOnTeam(supabase, user.id, input.teamId);
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
          teamId: input.teamId,
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

  const supabase = createPracticeServiceClient();
  try {
    await assertCoachOnTeam(supabase, user.id, args.teamId);
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Not authorized.' };
  }

  try {
    const dup = await duplicateTemplate(
      supabase,
      args.sourceTemplateId,
      args.newName,
      user.id,
    );
    return { templateId: dup.id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to duplicate.' };
  }
}

export async function archiveTemplateAction(args: {
  id: string;
  teamId: string;
}): Promise<SaveResult> {
  const auth = createServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) return { error: 'Not authenticated.' };

  const supabase = createPracticeServiceClient();
  try {
    await assertCoachOnTeam(supabase, user.id, args.teamId);
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Not authorized.' };
  }

  try {
    await archiveTemplate(supabase, args.id, true);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to archive.' };
  }
}
