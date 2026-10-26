'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { deactivateRosterPlayer, updateRosterPlayer } from '@/lib/services/roster/roster-players';
import { playerFieldsFromForm } from '../player-form-fields';

function serviceClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function updatePlayerAction(_prevState: string | null | undefined, formData: FormData) {
  const authClient = createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return 'Not authenticated — please log in again.';

  const teamId = formData.get('teamId') as string;
  const playerId = formData.get('playerId') as string;
  if (!teamId || !playerId) return 'Missing required IDs.';

  const result = await updateRosterPlayer(serviceClient(), user.id, { teamId, playerId, ...playerFieldsFromForm(formData) });
  if (!result.ok) return result.error;

  redirect(`/teams/${teamId}/roster`);
}

export async function deactivatePlayerAction(_prevState: string | null | undefined, formData: FormData) {
  const authClient = createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return 'Not authenticated — please log in again.';

  const teamId = formData.get('teamId') as string;
  const playerId = formData.get('playerId') as string;
  if (!teamId || !playerId) return 'Missing required IDs.';

  const result = await deactivateRosterPlayer(serviceClient(), user.id, { teamId, playerId, reason: 'deactivated' });
  if (!result.ok) return result.error;

  redirect(`/teams/${teamId}/roster`);
}
