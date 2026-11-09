import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { createServerClient } from '@/lib/supabase/server';
import { getActiveTeam } from '@/lib/active-team';
import { getLeagueMeta } from '@/lib/league-home/load';
import { leagueStatsHref } from '@/lib/league-home/stats-href';
import { parseTab } from '@/lib/league-stats/columns';
import { getLeagueStatsData } from '@/lib/league-stats/load';
import { LeagueStatsView } from './_components/LeagueStatsView';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const auth = createServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  const meta = await getLeagueMeta(params.slug);
  if (!meta) return { title: 'League not found' };
  const isPrivate = meta.visibility === 'signed_in';
  if (isPrivate && !user) return { title: meta.name, robots: { index: false, follow: false } };
  return {
    title: `${meta.name} — League Stats`,
    description: `${meta.name} full batting, pitching and team statistics.`,
    robots: isPrivate ? { index: false, follow: false } : undefined,
  };
}

export default async function LeagueStatsPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { season?: string; tab?: string };
}): Promise<JSX.Element> {
  const auth = createServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  const activeTeam = user ? await getActiveTeam(auth, user.id) : null;
  const tab = parseTab(searchParams.tab);
  const data = await getLeagueStatsData(
    params.slug,
    { userId: user?.id ?? null, activeTeam: activeTeam ? { id: activeTeam.id, name: activeTeam.name } : null },
    searchParams.season,
  );

  if ('notFound' in data) notFound();
  if ('blocked' in data) {
    // Encode the whole target so reserved characters can't break the redirect query.
    const target = leagueStatsHref(params.slug, searchParams.season, tab);
    return (
      <main className="mx-auto max-w-md p-12 text-center">
        <h1 className="text-2xl font-bold">{data.league.name}</h1>
        <p className="mt-2 text-slate-600">This league is visible to signed-in users only.</p>
        <a
          href={`/login?redirectTo=${encodeURIComponent(target)}`}
          className="mt-4 inline-block rounded bg-slate-900 px-4 py-2 text-white"
        >
          Sign in
        </a>
      </main>
    );
  }

  return (
    <main className={`league-scheme-${data.theme.colorScheme} mx-auto max-w-5xl p-4 md:p-8`}>
      {/* The header (back link, title, season switcher) lives in the client view so
          season links keep the current tab. */}
      <LeagueStatsView
        // Remount on season change so tab/filter/sort state starts fresh for the new data.
        key={data.season}
        slug={data.slug}
        season={data.season}
        seasons={data.seasons}
        leagueName={data.league.name}
        initialTab={tab}
        players={data.players}
        ranks={data.ranks}
        teams={data.teams}
        myPlayers={data.myPlayers}
        ourTeamId={data.ourTeamId}
        mins={data.mins}
        rankingEnabled={data.rankingEnabled}
        standingsRankEnabled={data.standingsRankEnabled}
      />
    </main>
  );
}
