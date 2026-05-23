'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import {
  CURRICULUM_VERSION,
  getModuleBySlug,
  isCurriculumComplete,
  nextIncompleteSlug,
} from '@baseball/shared';

function service() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function recordModuleCompletion(
  slug: string,
): Promise<{ ok: true; certifiedNow: boolean; nextSlug: string | null } | { ok: false; error: string }> {
  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not authenticated.' };

  if (!getModuleBySlug(slug)) {
    return { ok: false, error: 'Unknown module.' };
  }

  const sb = service();

  const { error: insertError } = await sb
    .from('training_module_completions')
    .upsert(
      {
        user_id: user.id,
        module_slug: slug,
        curriculum_version: CURRICULUM_VERSION,
      },
      { onConflict: 'user_id,module_slug,curriculum_version' },
    );

  if (insertError) {
    return { ok: false, error: `Failed to record completion: ${insertError.message}` };
  }

  const { data: rows, error: readError } = await sb
    .from('training_module_completions')
    .select('module_slug')
    .eq('user_id', user.id)
    .eq('curriculum_version', CURRICULUM_VERSION);

  if (readError) {
    return { ok: false, error: `Saved, but could not refresh progress: ${readError.message}` };
  }

  const completed = (rows ?? []).map((r) => r.module_slug);
  let certifiedNow = false;

  if (isCurriculumComplete(completed)) {
    const { data: existing } = await sb
      .from('user_certifications')
      .select('id')
      .eq('user_id', user.id)
      .eq('curriculum_version', CURRICULUM_VERSION)
      .maybeSingle();

    if (!existing) {
      const { error: certError } = await sb.from('user_certifications').insert({
        user_id: user.id,
        curriculum_version: CURRICULUM_VERSION,
      });
      if (!certError) certifiedNow = true;
    }
  }

  revalidatePath('/training');
  revalidatePath(`/training/${slug}`);
  revalidatePath('/dashboard');

  return {
    ok: true,
    certifiedNow,
    nextSlug: nextIncompleteSlug(completed),
  };
}
