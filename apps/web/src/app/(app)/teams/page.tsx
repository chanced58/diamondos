import type { JSX } from 'react';
import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { getTeamsForUser } from '@baseball/database';

// Redirect to the active team's roster, or to team creation if none exists.
export default async function TeamsIndexPage(): Promise<JSX.Element | null> {
  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const memberships = await getTeamsForUser(supabase, user.id);
  const firstTeam = memberships?.[0]?.teams as { id: string } | undefined;

  if (firstTeam?.id) {
    redirect(`/teams/${firstTeam.id}/roster`);
  }

  redirect('/admin/create-team');
}
