'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { canManageRoster } from '@/lib/roster-access';

export async function addInjuryFlagAction(_prev: string | null | undefined, formData: FormData) {
  const auth = createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return 'Not authenticated.';

  const teamId = formData.get('teamId') as string;
  const playerId = formData.get('playerId') as string;
  const injurySlug = formData.get('injurySlug') as string;
  const effectiveFrom = (formData.get('effectiveFrom') as string) || new Date().toISOString().slice(0, 10);
  const effectiveTo = (formData.get('effectiveTo') as string) || null;
  const notes = (formData.get('notes') as string)?.trim() || null;

  if (!teamId || !playerId || !injurySlug) return 'Missing required fields.';
  if (effectiveTo && effectiveTo < effectiveFrom) return 'End date must be on or after start date.';
  if (!(await canManageRoster(teamId, user.id))) return 'Not authorized.';

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { error } = await supabase.from('player_injury_flags').insert({
    player_id: playerId,
    injury_slug: injurySlug,
    effective_from: effectiveFrom,
    effective_to: effectiveTo,
    notes,
    created_by: user.id,
  });

  if (error) {
    if (error.code === '23505') {
      return 'This player already has an open-ended flag for that injury. End it first, or set an end date on the new flag.';
    }
    return `Save failed: ${error.message}`;
  }

  revalidatePath(`/teams/${teamId}/roster/${playerId}/availability`);
  return null;
}

export async function endInjuryFlagAction(_prev: string | null | undefined, formData: FormData) {
  const auth = createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return 'Not authenticated.';

  const teamId = formData.get('teamId') as string;
  const playerId = formData.get('playerId') as string;
  const flagId = formData.get('flagId') as string;
  const endDate = (formData.get('endDate') as string) || new Date().toISOString().slice(0, 10);

  if (!teamId || !playerId || !flagId) return 'Missing ids.';
  if (!(await canManageRoster(teamId, user.id))) return 'Not authorized.';

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { error } = await supabase
    .from('player_injury_flags')
    .update({ effective_to: endDate })
    .eq('id', flagId);
  if (error) return `Save failed: ${error.message}`;

  revalidatePath(`/teams/${teamId}/roster/${playerId}/availability`);
  return null;
}
