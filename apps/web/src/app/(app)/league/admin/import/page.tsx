import type { JSX } from 'react';
import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { getActiveTeam } from '@/lib/active-team';
import { getActiveLeague } from '@/lib/active-league';
import { getLeagueAccess } from '@/lib/league-access';
import {
  getLeagueTeamsAll,
  getLeagueForStaff,
  getImportBatches,
} from '@baseball/database';
import { ImportWizardClient } from './ImportWizardClient';

export const metadata: Metadata = { title: 'Import Historical Data' };

export default async function LeagueImportPage(): Promise<JSX.Element | null> {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const activeTeam = await getActiveTeam(supabase, user.id);
  let leagueId = activeTeam ? (await getActiveLeague(activeTeam.id))?.id ?? null : null;
  if (!leagueId) {
    const staffLeague = await getLeagueForStaff(db, user.id);
    leagueId = staffLeague?.id ?? null;
  }
  if (!leagueId) redirect('/dashboard');

  // Import is admin-only (stricter than the staff-level admin landing).
  const access = await getLeagueAccess(leagueId, user.id);
  if (!access.isLeagueAdmin) redirect('/dashboard');

  const [teams, batches] = await Promise.all([
    getLeagueTeamsAll(db, leagueId),
    getImportBatches(db, leagueId),
  ]);

  // League-owned opponent teams (existing, incl. historical) for subject-team choice.
  const { data: opponentTeams } = await db
    .from('opponent_teams')
    .select('id, name, is_historical')
    .eq('league_id', leagueId)
    .order('name');

  const platformTeams = (teams ?? [])
    .filter((m) => m.teams)
    .map((m) => ({ id: m.teams!.id, name: m.teams!.name }));

  return (
    <ImportWizardClient
      leagueId={leagueId}
      teams={platformTeams}
      opponentTeams={(opponentTeams ?? []) as { id: string; name: string; is_historical: boolean }[]}
      batches={batches}
    />
  );
}
