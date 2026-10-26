'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { addInjuryFlag, endInjuryFlag } from '@/lib/services/roster/injury-flags';

function serviceClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

const utcToday = () => new Date().toISOString().slice(0, 10);

export async function addInjuryFlagAction(_prev: string | null | undefined, formData: FormData) {
  const auth = createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return 'Not authenticated.';

  const teamId = formData.get('teamId') as string;
  const playerId = formData.get('playerId') as string;
  if (!teamId || !playerId) return 'Missing required fields.';

  const result = await addInjuryFlag(serviceClient(), user.id, {
    teamId,
    playerId,
    injurySlug: formData.get('injurySlug') ?? '',
    effectiveFrom: (formData.get('effectiveFrom') as string) || utcToday(),
    effectiveTo: formData.get('effectiveTo') ?? '',
    notes: formData.get('notes') ?? '',
  });
  if (!result.ok) return result.error;

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
  if (!teamId || !playerId || !flagId) return 'Missing ids.';

  const result = await endInjuryFlag(serviceClient(), user.id, {
    teamId,
    playerId,
    flagId,
    endDate: (formData.get('endDate') as string) || utcToday(),
  });
  if (!result.ok) return result.error;

  revalidatePath(`/teams/${teamId}/roster/${playerId}/availability`);
  return null;
}
