import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { CURRICULUM_VERSION, isCurriculumComplete, type TrainingProgress } from '@baseball/shared';

function service() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function getTrainingProgress(userId: string): Promise<TrainingProgress> {
  const empty: TrainingProgress = {
    completedSlugs: [],
    isCertified: false,
    curriculumVersion: CURRICULUM_VERSION,
  };

  const db = service();
  if (!db) return empty;

  try {
    const [{ data: completions }, { data: cert }] = await Promise.all([
      db
        .from('training_module_completions')
        .select('module_slug')
        .eq('user_id', userId)
        .eq('curriculum_version', CURRICULUM_VERSION),
      db
        .from('user_certifications')
        .select('id')
        .eq('user_id', userId)
        .eq('curriculum_version', CURRICULUM_VERSION)
        .maybeSingle(),
    ]);

    const completedSlugs = (completions ?? []).map((r) => r.module_slug);
    const isCertified = !!cert || isCurriculumComplete(completedSlugs);

    return {
      completedSlugs,
      isCertified,
      curriculumVersion: CURRICULUM_VERSION,
    };
  } catch {
    // Migration may not have run yet in this environment; surface an empty state
    // instead of crashing the app layout.
    return empty;
  }
}

const COACHING_ROLES = new Set([
  'head_coach',
  'assistant_coach',
  'scorekeeper',
  'staff',
  'athletic_director',
]);

export async function hasCoachingRole(userId: string): Promise<boolean> {
  const db = service();
  if (!db) return false;
  const { data } = await db
    .from('team_members')
    .select('role')
    .eq('user_id', userId)
    .eq('is_active', true);
  return (data ?? []).some((row) => COACHING_ROLES.has(row.role));
}
