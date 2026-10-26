import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { CURRICULUM_VERSION, type TrainingProgress } from '@baseball/shared';
import { hasCoachingRole as hasCoachingRoleWith, readTrainingProgress } from '@/lib/services/training/training';

function service() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

/** The user's training progress (the same read the mobile app gets); empty when it can't be read. */
export async function getTrainingProgress(userId: string): Promise<TrainingProgress> {
  const empty: TrainingProgress = {
    completedSlugs: [],
    isCertified: false,
    curriculumVersion: CURRICULUM_VERSION,
  };

  const db = service();
  if (!db) return empty;

  try {
    return await readTrainingProgress(db, userId);
  } catch {
    // Migration may not have run yet in this environment; surface an empty state
    // instead of crashing the app layout.
    return empty;
  }
}

/** Whether the user holds a coaching role (the sidebar's Training entry); false when it can't be read. */
export async function hasCoachingRole(userId: string): Promise<boolean> {
  const db = service();
  if (!db) return false;
  try {
    return await hasCoachingRoleWith(db, userId);
  } catch {
    return false;
  }
}
