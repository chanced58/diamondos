import type { SupabaseClient } from '@supabase/supabase-js';
import {
  practiceIdInputSchema,
  runPracticeInputSchema,
  type PracticeRunResponse,
} from '@baseball/shared';
import {
  completeBlock,
  getPracticeWithBlocks,
  markPracticeCompleted,
  markPracticeStarted,
  setActiveBlock,
  skipBlock,
  startBlock,
} from '@baseball/database';
import { checkCoachOnTeam } from '@/lib/practices/authz';
import { invalidInput, serviceError, serviceOk, type ServiceResult } from '../result';
import { failed } from './practice-lookup';

/**
 * Running a practice block by block (the web Practice runner), shared with
 * the mobile `/api/m/v1/practices/:id/run` route. The rules are the web
 * runner's: head coaches and athletic directors start and finish the whole
 * practice and control every block; an assistant coach controls only the
 * blocks assigned to them. Every block is checked to belong to the practice.
 * Starts are first-writer-wins, so a phone and the web can run it together.
 */

type Practice = NonNullable<Awaited<ReturnType<typeof getPracticeWithBlocks>>>;

export async function loadPracticeRun(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<PracticeRunResponse>> {
  const parsed = practiceIdInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { practiceId } = parsed.data;

  const access = await authorize(db, practiceId, actorUserId, 'loadPracticeRun');
  if ('result' in access) return access.result;
  return serviceOk(toRunResponse(access.practice, access.role, actorUserId));
}

/** Applies one runner action and answers the runner as it now stands. */
export async function runPractice(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<PracticeRunResponse>> {
  const parsed = runPracticeInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const input = parsed.data;

  const access = await authorize(db, input.practiceId, actorUserId, 'runPractice');
  if ('result' in access) return access.result;
  const { practice, role } = access;
  const now = new Date().toISOString();

  try {
    if (input.action === 'start' || input.action === 'complete') {
      if (!isHeadCoachOrAD(role)) {
        return serviceError('forbidden', 'Only head coaches or athletic directors can start or finish a practice.');
      }
      if (input.action === 'start') {
        await markPracticeStarted(db as never, practice.id, now);
      } else {
        await markPracticeCompleted(db as never, practice.id, now);
        await setActiveBlock(db as never, practice.id, null);
      }
    } else {
      const block = practice.blocks.find((b) => b.id === input.blockId);
      if (!block) return serviceError('invalid', 'Block is not part of this practice.');
      if (!canControlBlock(role, actorUserId, block.assignedCoachId)) {
        return serviceError('forbidden', 'Only the block owner or a head coach can modify this block.');
      }
      if (input.action === 'startBlock') {
        // Only move the active-block pointer if this start won the race.
        if (await startBlock(db as never, block.id, now)) await setActiveBlock(db as never, practice.id, block.id);
      } else if (input.action === 'skipBlock') {
        await skipBlock(db as never, block.id);
      } else {
        await completeBlock(db as never, block.id, now, Math.max(0, Math.round(input.actualDurationMinutes)));
      }
    }

    const updated = await getPracticeWithBlocks(db as never, practice.id);
    if (!updated) return serviceError('not_found', 'Practice not found.');
    return serviceOk(toRunResponse(updated, role, actorUserId));
  } catch (error) {
    return failed('runPractice', practice.id, actorUserId, error);
  }
}

async function authorize(
  db: SupabaseClient,
  practiceId: string,
  actorUserId: string,
  service: string,
): Promise<{ result: ServiceResult<never> } | { practice: Practice; role: string | null }> {
  let practice: Practice | null;
  try {
    practice = await getPracticeWithBlocks(db as never, practiceId);
  } catch (error) {
    return { result: failed<never>(service, practiceId, actorUserId, error) };
  }
  if (!practice) return { result: serviceError('not_found', 'Practice not found.') as ServiceResult<never> };

  let role: string | null;
  try {
    const check = await checkCoachOnTeam(db, actorUserId, practice.teamId);
    if (!check.isCoach) return { result: serviceError('forbidden', 'Only coaches can run practices.') as ServiceResult<never> };
    role = check.role;
  } catch (error) {
    return { result: failed<never>(service, practiceId, actorUserId, error) };
  }
  return { practice, role };
}

function isHeadCoachOrAD(role: string | null) {
  return role === 'head_coach' || role === 'athletic_director';
}

function canControlBlock(role: string | null, actorUserId: string, assignedCoachId: string | undefined) {
  return isHeadCoachOrAD(role) || assignedCoachId === actorUserId;
}

function toRunResponse(practice: Practice, role: string | null, actorUserId: string): PracticeRunResponse {
  return {
    practice: {
      id: practice.id,
      scheduledAt: practice.scheduledAt,
      status: practice.status,
      runStatus: practice.runStatus,
      startedAt: practice.startedAt ?? null,
      completedAt: practice.completedAt ?? null,
    },
    canRunPractice: isHeadCoachOrAD(role),
    blocks: [...practice.blocks]
      .sort((a, b) => a.position - b.position)
      .map((block) => ({
        id: block.id,
        position: block.position,
        blockType: block.blockType,
        title: block.title,
        plannedDurationMinutes: block.plannedDurationMinutes,
        actualDurationMinutes: block.actualDurationMinutes ?? null,
        status: block.status,
        startedAt: block.startedAt ?? null,
        completedAt: block.completedAt ?? null,
        notes: block.notes ?? null,
        canControl: canControlBlock(role, actorUserId, block.assignedCoachId),
      })),
  };
}
