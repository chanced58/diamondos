import type { JSX } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { getLeagueTeams } from '@baseball/database';
import { createServerClient } from '@/lib/supabase/server';
import { resolveAdminLeague } from '@/lib/league-games/resolve-admin-league';
import { listLeagueGames } from '@/lib/services/league-games/league-games';
import { listUnmatchedPlaceholders } from '@/lib/services/league-games/placeholders';
import { LeagueGamesClient } from './LeagueGamesClient';

export const metadata: Metadata = { title: 'League Games' };

export default async function LeagueGamesPage({
  searchParams,
}: {
  searchParams: { leagueId?: string };
}): Promise<JSX.Element | null> {
  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const league = await resolveAdminLeague(supabase, db, user.id, searchParams.leagueId);
  if (!league) redirect('/dashboard');

  const { data: settings } = await db
    .from('leagues')
    .select('schedules_games, current_season')
    .eq('id', league.id)
    .maybeSingle();
  const season = (settings?.current_season as string | null | undefined)?.trim() || null;

  if (settings?.schedules_games !== true) {
    return (
      <div className="max-w-3xl mx-auto space-y-2">
        <h1 className="text-xl font-semibold text-gray-900">League games</h1>
        <p className="text-sm text-gray-500">
          {league.name} does not schedule its own games. Turn on league scheduling in{' '}
          <Link href="/league/admin" className="text-brand-700 hover:underline">League Admin</Link> to use this page.
        </p>
      </div>
    );
  }

  const [games, unmatched, members] = await Promise.all([
    season ? listLeagueGames(db, user.id, { leagueId: league.id, season }) : null,
    listUnmatchedPlaceholders(db, user.id, { leagueId: league.id }),
    getLeagueTeams(db, league.id),
  ]);
  if (games && !games.ok) redirect('/dashboard');

  const teams = members
    .filter((member) => member.team_id !== null && member.teams?.name)
    .map((member) => ({ id: member.team_id as string, name: member.teams?.name as string }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">League games</h1>
        <p className="text-sm text-gray-500">
          {league.name}
          {season ? `, ${season}` : ''}
        </p>
      </div>
      <LeagueGamesClient
        leagueId={league.id}
        season={season}
        isLeagueAdmin={league.isLeagueAdmin}
        teams={teams}
        games={games?.ok ? games.data.games : []}
        unmatchedCount={unmatched.ok ? unmatched.data.placeholders.length : 0}
      />
    </div>
  );
}
