import type { JSX } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { loadLeagueMaxInnings, loadManualResult } from '@/lib/services/league-games/manual-result';
import { ManualResultForm } from './ManualResultForm';

export const metadata: Metadata = { title: 'Enter Result' };

export default async function ManualResultPage({ params }: { params: { leagueGameId: string } }): Promise<JSX.Element> {
  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const loaded = await loadManualResult(db, user.id, { leagueGameId: params.leagueGameId });
  if (!loaded.ok) notFound();

  const { data: game } = await db
    .from('league_games')
    .select('league_id, home_team_id, away_team_id')
    .eq('id', params.leagueGameId)
    .maybeSingle();
  if (!game) notFound();
  const { league_id: leagueId, home_team_id: homeTeamId, away_team_id: awayTeamId } = game as {
    league_id: string;
    home_team_id: string;
    away_team_id: string;
  };
  const { data: teams } = await db.from('teams').select('id, name').in('id', [homeTeamId, awayTeamId]);
  const names = new Map(((teams ?? []) as { id: string; name: string }[]).map((team) => [team.id, team.name]));
  const maxInnings = await loadLeagueMaxInnings(db, leagueId);

  const { result, rosters, canEdit } = loaded.data;
  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div>
        <Link href="/league/admin" className="text-xs text-brand-700 hover:underline">
          Back to league admin
        </Link>
        <h1 className="text-xl font-semibold text-gray-900">Enter result</h1>
        <p className="text-sm text-gray-500">
          {names.get(awayTeamId) ?? 'Away'} at {names.get(homeTeamId) ?? 'Home'}. For games nobody scored in the app.
        </p>
      </div>
      {canEdit ? null : (
        <p className="text-sm text-gray-600 rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
          This result is read-only: the game was scored in the app, or a league admin entered it.
        </p>
      )}
      <ManualResultForm
        leagueGameId={params.leagueGameId}
        home={{ teamId: homeTeamId, name: names.get(homeTeamId) ?? 'Home' }}
        away={{ teamId: awayTeamId, name: names.get(awayTeamId) ?? 'Away' }}
        rosters={rosters}
        initial={result}
        minInnings={maxInnings}
        canEdit={canEdit}
      />
    </div>
  );
}
