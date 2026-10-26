'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { deactivateRosterPlayer, reactivateRosterPlayer } from '@/lib/services/roster/roster-players';

function serviceClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function removePlayerAction(_prevState: string | null | undefined, formData: FormData) {
  const authClient = createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return 'Not authenticated.';

  const teamId = formData.get('teamId') as string;
  const playerId = formData.get('playerId') as string;
  if (!teamId || !playerId) return 'Missing required IDs.';

  const result = await deactivateRosterPlayer(serviceClient(), user.id, { teamId, playerId, reason: 'removed' });
  if (!result.ok) return result.error;

  redirect(`/teams/${teamId}/roster`);
}

export async function reactivatePlayerAction(_prevState: string | null | undefined, formData: FormData) {
  const authClient = createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return 'Not authenticated.';

  const teamId = formData.get('teamId') as string;
  const playerId = formData.get('playerId') as string;
  const jerseyNumber = formData.get('jerseyNumber') ? Number(formData.get('jerseyNumber')) : null;
  if (!teamId || !playerId) return 'Missing required IDs.';

  const result = await reactivateRosterPlayer(serviceClient(), user.id, { teamId, playerId, jerseyNumber });
  if (!result.ok) return result.error;

  redirect(`/teams/${teamId}/roster`);
}
