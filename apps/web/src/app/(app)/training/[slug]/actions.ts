'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { completeTrainingModule } from '@/lib/services/training/training';

function service() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/** Records a module complete; a wrapper over the service `/api/m/v1` shares. */
export async function recordModuleCompletion(
  slug: string,
): Promise<{ ok: true; certifiedNow: boolean; nextSlug: string | null } | { ok: false; error: string }> {
  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not authenticated.' };

  const result = await completeTrainingModule(service(), user.id, { slug });
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath('/training');
  revalidatePath(`/training/${slug}`);
  revalidatePath('/dashboard');

  return { ok: true, certifiedNow: result.data.certifiedNow, nextSlug: result.data.nextSlug };
}
