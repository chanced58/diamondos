import type { JSX } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { formatInTimeZone, mergeWithDefaults } from '@baseball/shared';
import type { StatTier } from '@baseball/shared';
import { createServerClient } from '@/lib/supabase/server';
import { getTeamTier } from '@/lib/team-tier';
import { loadTournamentPlayerStats } from '@/lib/tournament-player-stats';
import { BattingStatsTable } from '../../compliance/BattingStatsTable';
import { PitchingStatsTable } from '../../compliance/PitchingStatsTable';

export const metadata: Metadata = { title: 'Tournament — DiamondOS' };

function statTierForTeamLevel(level: string | null | undefined): StatTier {
  if (level === 'youth' || level === 'middle_school') return 'youth';
  if (level === 'college' || level === 'pro') return 'college';
  return 'high_school';
}

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
    .select('id, name, start_date, end_date, status, scoring_settings, tournament_teams(team_id, season_id, is_tournament_only, teams(id, name, level))')
    .eq('id', params.tournamentId)
    .maybeSingle();
  if (error) throw error;
  if (!tournament) notFound();

  const { data: games, error: gamesError } = await client
    .from('games')
    .select('id, opponent_name, scheduled_at, time_zone, status, location_type')
    .eq('tournament_id', tournament.id)
    .order('scheduled_at');
  if (gamesError) throw gamesError;

  const participant = tournament.tournament_teams[0];
  if (!participant) notFound();
  const team = Array.isArray(participant.teams) ? participant.teams[0] : participant.teams;
  const settings = mergeWithDefaults(tournament.scoring_settings);

  // Read through the viewer's RLS client: stats show only what the viewer
  // could already see on the team's own pages.
  const [playerStats, subscriptionTier] = await Promise.all([
    loadTournamentPlayerStats(client, {
      tournamentId: tournament.id,
      teamId: participant.team_id,
      seasonId: participant.season_id,
    }),
    getTeamTier(participant.team_id),
  ]);
  const statTier = statTierForTeamLevel(team?.level);

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

      <section className="mt-8 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-950">Tournament games</h2>
            <p className="mt-1 text-sm text-gray-500">Games scheduled for this tournament stay separate from the team&apos;s regular schedule.</p>
          </div>
          <Link href={`/games/new?tournamentId=${tournament.id}`} className="text-sm font-semibold text-brand-700 hover:underline">Add game</Link>
        </div>
        {games?.length ? (
          <ul className="mt-4 divide-y divide-gray-100">
            {games.map((game) => (
              <li key={game.id}>
                <Link href={`/games/${game.id}`} className="flex flex-wrap items-center justify-between gap-2 py-3 hover:text-brand-700">
                  <span className="font-medium">{game.opponent_name ?? 'Opponent TBD'}</span>
                  <span className="text-sm text-gray-500">{formatInTimeZone(game.scheduled_at, game.time_zone, { dateStyle: 'short', timeStyle: 'short' })} · {game.status.replace('_', ' ')}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-gray-500">No games scheduled yet.</p>
        )}
      </section>
      <section className="mt-8 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-950">Player stats</h2>
        <p className="mt-1 text-sm text-gray-500">
          {playerStats.scoredGameCount === 0
            ? 'Stats appear here once a tournament game is scored.'
            : `From ${playerStats.scoredGameCount} scored ${playerStats.scoredGameCount === 1 ? 'game' : 'games'}. Tournament stats are kept separate from the regular season.`}
        </p>
        {playerStats.scoredGameCount > 0 && (
          <div className="mt-5 space-y-6">
            <div>
              <h3 className="mb-2 text-sm font-semibold text-gray-900">Batting</h3>
              {playerStats.batting.length ? (
                <BattingStatsTable stats={playerStats.batting} tier={statTier} subscriptionTier={subscriptionTier} />
              ) : (
                <p className="text-sm text-gray-500">No plate appearances recorded yet.</p>
              )}
            </div>
            <div>
              <h3 className="mb-2 text-sm font-semibold text-gray-900">Pitching</h3>
              {playerStats.pitching.length ? (
                <PitchingStatsTable stats={playerStats.pitching} tier={statTier} subscriptionTier={subscriptionTier} />
              ) : (
                <p className="text-sm text-gray-500">No pitches recorded yet.</p>
              )}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
