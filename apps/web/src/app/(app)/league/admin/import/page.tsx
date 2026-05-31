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

  // Import is admin-only. Resolve the league where the user is actually a
  // league admin — the active-team league may differ from where they admin, so
  // check candidates and pick the first that grants admin (don't lock to the
  // active team and then redirect).
  const activeTeam = await getActiveTeam(supabase, user.id);
  const activeLeagueId = activeTeam ? (await getActiveLeague(activeTeam.id))?.id ?? null : null;
  const staffLeagueId = (await getLeagueForStaff(db, user.id))?.id ?? null;

  let leagueId: string | null = null;
  for (const candidate of [activeLeagueId, staffLeagueId]) {
    if (!candidate || candidate === leagueId) continue;
    const access = await getLeagueAccess(candidate, user.id);
    if (access.isLeagueAdmin) {
      leagueId = candidate;
      break;
    }
  }
  if (!leagueId) redirect('/dashboard');

  const [teams, batches] = await Promise.all([
    getLeagueTeamsAll(db, leagueId),
    getImportBatches(db, leagueId),
  ]);

  // League-owned opponent teams (existing, incl. historical) for subject-team choice.
  const { data: opponentTeams, error: opponentError } = await db
    .from('opponent_teams')
    .select('id, name, is_historical')
    .eq('league_id', leagueId)
    .order('name');
  if (opponentError) {
    console.error('Failed to load league opponent teams for import', { leagueId, error: opponentError });
    throw new Error('Unable to load league teams. Please try again.');
  }

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
