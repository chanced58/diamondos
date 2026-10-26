'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { createRosterPlayer } from '@/lib/services/roster/roster-players';
import { playerFieldsFromForm } from '../player-form-fields';

export async function addPlayerAction(_prevState: string | null | undefined, formData: FormData) {
  const authClient = createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return 'Not authenticated — please log in again.';

  const teamId = formData.get('teamId') as string;
  if (!teamId) return 'Missing team ID.';

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const result = await createRosterPlayer(supabase, user.id, { teamId, ...playerFieldsFromForm(formData) });
  if (!result.ok) return result.error;

  redirect(`/teams/${teamId}/roster`);
}
