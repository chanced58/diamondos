'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { deleteTeamEvent } from '@/lib/services/team-events/delete-team-event';

export async function deleteEventAction(_prevState: string | null | undefined, formData: FormData) {
  const authClient = createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return 'Not authenticated.';

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const result = await deleteTeamEvent(supabase, user.id, { eventId: formData.get('eventId') });
  if (!result.ok) return result.error;

  redirect('/games');
}
