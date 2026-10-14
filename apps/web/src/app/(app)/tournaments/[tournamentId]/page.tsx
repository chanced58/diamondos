import type { JSX } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { mergeWithDefaults } from '@baseball/shared';
import { createServerClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Tournament — DiamondOS' };

export default async function TournamentWorkspacePage({
  params,
}: {
  params: { tournamentId: string };
}): Promise<JSX.Element> {
  const client = createServerClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) redirect('/login');

  const { data: tournament, error } = await client
    .from('tournaments')
    .select('id, name, start_date, end_date, status, scoring_settings, tournament_teams(team_id, season_id, is_tournament_only, teams(id, name))')
    .eq('id', params.tournamentId)
    .maybeSingle();
  if (error) throw error;
  if (!tournament) notFound();

  const participant = tournament.tournament_teams[0];
  if (!participant) notFound();
  const team = Array.isArray(participant.teams) ? participant.teams[0] : participant.teams;
  const settings = mergeWithDefaults(tournament.scoring_settings);

  return (
    <main className="mx-auto max-w-5xl p-8">
      <Link href="/tournaments" className="text-sm font-medium text-brand-700 hover:underline">&larr; Tournaments</Link>
      <div className="mt-5 flex flex-wrap items-start justify-between gap-5">
        <div>
          <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold capitalize text-amber-800">{tournament.status}</span>
          <h1 className="mt-3 text-3xl font-bold text-gray-950">{tournament.name}</h1>
          <p className="mt-2 text-gray-600">{tournament.start_date} – {tournament.end_date}</p>
        </div>
        <Link href={`/games/new?tournamentId=${tournament.id}`} className="rounded-lg bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-800">Add Game</Link>
      </div>

      <div className="mt-8 grid gap-5 md:grid-cols-2">
        <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-950">Tournament team</h2>
          <p className="mt-2 text-gray-700">{team?.name ?? 'Team'}</p>
          <Link href={`/teams/${participant.team_id}/roster`} className="mt-4 inline-block text-sm font-medium text-brand-700 hover:underline">Manage roster</Link>
        </section>
        <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-950">Lineup rules</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-4"><dt className="text-gray-600">More than 9 batters</dt><dd className="font-medium text-gray-900">{settings.lineup.allowExpanded ? `Allowed · up to ${settings.lineup.maxBatters}` : 'Not allowed'}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-gray-600">Mid-game expansion</dt><dd className="font-medium text-gray-900">{settings.lineup.allowMidGameExtension ? 'Allowed' : 'Not allowed'}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-gray-600">Mid-game contraction</dt><dd className="font-medium text-gray-900">{settings.lineup.allowMidGameContraction ? 'Allowed' : 'Not allowed'}</dd></div>
          </dl>
        </section>
      </div>
    </main>
  );
}
