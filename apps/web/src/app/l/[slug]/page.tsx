import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { createServerClient } from '@/lib/supabase/server';
import { getLeagueHomeData } from '@/lib/league-home/load';
import { Hero } from './_components/Hero';
import { StandingsTable } from './_components/StandingsTable';
import { LeaderBoard } from './_components/LeaderBoard';
import { RecentUpcoming } from './_components/RecentUpcoming';
import { Spotlights } from './_components/Spotlights';

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
  const data = await getLeagueHomeData(params.slug, !!user);
  if ('notFound' in data) return { title: 'League not found' };
  if ('blocked' in data) return { title: data.league.name, robots: { index: false, follow: false } };
  return {
    title: `${data.league.name} — Standings & Leaders`,
    description: `${data.league.name} standings, statistical leaders, and recent results.`,
    robots: data.league.visibility === 'public' ? undefined : { index: false, follow: false },
  };
}

export default async function LeagueHomePage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { season?: string };
}): Promise<JSX.Element> {
  const auth = createServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  const data = await getLeagueHomeData(params.slug, !!user, searchParams.season);

  if ('notFound' in data) notFound();
  if ('blocked' in data) {
    return (
      <main className="mx-auto max-w-md p-12 text-center">
        <h1 className="text-2xl font-bold">{data.league.name}</h1>
        <p className="mt-2 text-slate-600">This league is visible to signed-in users only.</p>
        <a
          href={`/login?redirectTo=/l/${params.slug}`}
          className="mt-4 inline-block rounded bg-slate-900 px-4 py-2 text-white"
        >
          Sign in
        </a>
      </main>
    );
  }

  const allBoards = [...data.defaultBoards.batting, ...data.defaultBoards.pitching, ...data.defaultBoards.team];

  const sectionNode = (id: string): JSX.Element | null => {
    switch (id) {
      case 'hero':
        return (
          <Hero
            key="hero"
            name={data.league.name}
            logoUrl={data.league.logoUrl}
            theme={data.theme}
            counters={{ teams: data.counters.teams, games: data.counters.games, season: data.season }}
          />
        );
      case 'standings':
        return (
          <section key="standings">
            <SectionHeading title="Standings" seasons={data.seasons} active={data.season} slug={params.slug} />
            <StandingsTable rows={data.standings} />
          </section>
        );
      case 'spotlights':
        return <Spotlights key="spotlights" items={data.spotlights} />;
      case 'leaders':
        return (
          <section key="leaders">
            <h2 className="mb-3 text-xl font-bold">League Leaders</h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {allBoards.map((b) => (
                <LeaderBoard key={b.def.key} title={b.label} rows={b.rows} format={b.def.format} />
              ))}
            </div>
          </section>
        );
      case 'customLeaders':
        if (data.customBoards.length === 0) return null;
        return (
          <section key="customLeaders">
            <h2 className="mb-3 text-xl font-bold">Special Categories</h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {data.customBoards.map((b, i) => (
                <LeaderBoard key={`${b.def.key}-${i}`} title={b.label} rows={b.rows} format={b.def.format} />
              ))}
            </div>
          </section>
        );
      case 'recent':
        return (
          <section key="recent">
            <h2 className="mb-3 text-xl font-bold">Around the League</h2>
            <RecentUpcoming recent={data.recent} upcoming={data.upcoming} />
          </section>
        );
      default:
        return null;
    }
  };

  return (
    <main className="mx-auto max-w-5xl space-y-8 p-4 md:p-8">
      {data.theme.sections.filter((s) => s.enabled).map((s) => sectionNode(s.id))}
    </main>
  );
}

function SectionHeading({
  title,
  seasons,
  active,
  slug,
}: {
  title: string;
  seasons: string[];
  active: string;
  slug: string;
}): JSX.Element {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-xl font-bold">{title}</h2>
      {seasons.length > 1 ? (
        <div className="flex flex-wrap gap-1 text-sm">
          {seasons.map((s) => (
            <a
              key={s}
              href={`/l/${slug}?season=${encodeURIComponent(s)}`}
              className={`rounded px-2 py-1 ${s === active ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}
            >
              {s}
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}
