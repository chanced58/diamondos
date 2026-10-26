import type { SupabaseClient } from '@supabase/supabase-js';
import {
  CURRICULUM_VERSION,
  TRAINING_ROLES,
  completeTrainingModuleInputSchema,
  getModuleBySlug,
  isCurriculumComplete,
  nextIncompleteSlug,
  type CompleteTrainingModuleResponse,
  type TrainingProgress,
  type TrainingProgressResponse,
} from '@baseball/shared';
import { invalidInput, serviceError, serviceOk, type ServiceResult } from '../result';

/**
 * DiamondOS training (the web /training pages), shared with the mobile routes:
 * a user's completions in the current curriculum version and their
 * certification, and recording a module as complete. Each user reads and
 * writes only their own rows, through the service role (the web action's
 * client). The quiz is checked where it is taken, as on the web.
 */

/** Roles offered training, as the web sidebar decides. */
const COACHING_ROLES = new Set(TRAINING_ROLES);

/** The user's completions and certification in the current curriculum version. */
export async function readTrainingProgress(db: SupabaseClient, userId: string): Promise<TrainingProgress> {
  const [completions, certification] = await Promise.all([
    db.from('training_module_completions').select('module_slug').eq('user_id', userId).eq('curriculum_version', CURRICULUM_VERSION),
    db.from('user_certifications').select('id').eq('user_id', userId).eq('curriculum_version', CURRICULUM_VERSION).maybeSingle(),
  ]);
  if (completions.error) throw completions.error;
  if (certification.error) throw certification.error;

  const completedSlugs = ((completions.data ?? []) as Array<{ module_slug: string }>).map((r) => r.module_slug);
  return {
    completedSlugs,
    isCertified: Boolean(certification.data) || isCurriculumComplete(completedSlugs),
    curriculumVersion: CURRICULUM_VERSION,
  };
}

/** Whether the user holds a coaching role on any team (training is offered to them). */
export async function hasCoachingRole(db: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await db.from('team_members').select('role').eq('user_id', userId).eq('is_active', true);
  if (error) throw error;
  return ((data ?? []) as Array<{ role: string }>).some((row) => COACHING_ROLES.has(row.role));
}

/** The signed-in user's training progress, and whether training is offered to them. */
export async function loadTrainingProgress(db: SupabaseClient, actorUserId: string): Promise<ServiceResult<TrainingProgressResponse>> {
  try {
    const [progress, offered] = await Promise.all([readTrainingProgress(db, actorUserId), hasCoachingRole(db, actorUserId)]);
    return serviceOk({ ...progress, offered });
  } catch (error) {
    console.error(`[loadTrainingProgress] actor=${actorUserId} failed:`, error);
    return serviceError('failed', 'Something went wrong. Please try again.');
  }
}

/**
 * Records a module complete for the current curriculum version (idempotently)
 * and certifies the user when it finishes the curriculum. `certifiedNow` is
 * true only for the completion that earned the badge.
 */
export async function completeTrainingModule(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<CompleteTrainingModuleResponse>> {
  const parsed = completeTrainingModuleInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { slug } = parsed.data;
  if (!getModuleBySlug(slug)) return serviceError('not_found', 'Unknown module.');

  try {
    const { error: insertError } = await db
      .from('training_module_completions')
      .upsert(
        { user_id: actorUserId, module_slug: slug, curriculum_version: CURRICULUM_VERSION },
        { onConflict: 'user_id,module_slug,curriculum_version' },
      );
    if (insertError) throw insertError;

    const before = await readTrainingProgress(db, actorUserId);
    let certifiedNow = false;
    if (isCurriculumComplete(before.completedSlugs)) {
      const { data: existing, error: existingError } = await db
        .from('user_certifications')
        .select('id')
        .eq('user_id', actorUserId)
        .eq('curriculum_version', CURRICULUM_VERSION)
        .maybeSingle();
      if (existingError) throw existingError;
      if (!existing) {
        const { error: certError } = await db
          .from('user_certifications')
          .insert({ user_id: actorUserId, curriculum_version: CURRICULUM_VERSION });
        // Two completions racing to certify: the other one won, and the user is certified either way.
        if (certError) console.error(`[completeTrainingModule] certify actor=${actorUserId} failed:`, certError);
        else certifiedNow = true;
      }
    }

    const offered = await hasCoachingRole(db, actorUserId);
    return serviceOk({
      certifiedNow,
      nextSlug: nextIncompleteSlug(before.completedSlugs),
      progress: { ...before, offered },
    });
  } catch (error) {
    console.error(`[completeTrainingModule] slug=${slug} actor=${actorUserId} failed:`, error);
    return serviceError('failed', 'Something went wrong. Please try again.');
  }
}
