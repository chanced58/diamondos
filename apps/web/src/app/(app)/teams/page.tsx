import type { JSX } from 'react';
import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { getActiveTeam } from '@/lib/active-team';

// Redirect to the active team's roster, or to team creation if none exists.
export default async function TeamsIndexPage(): Promise<JSX.Element | null> {
  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const activeTeam = await getActiveTeam(supabase, user.id);

  if (activeTeam?.id) {
    redirect(`/teams/${activeTeam.id}/roster`);
  }

  redirect('/admin/create-team');
}
