import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { createServerClient } from '@/lib/supabase/server';
import { getActiveTeam } from '@/lib/active-team';
import { getLeagueHomeData, getLeagueMeta } from '@/lib/league-home/load';
import { teamIdByName } from '@/lib/league-home/team-load';
import { Hero } from './_components/Hero';
import { StandingsTable } from './_components/StandingsTable';
import { LeadersSection } from './_components/LeadersSection';
import { RecentUpcoming } from './_components/RecentUpcoming';
import { Spotlights } from './_components/Spotlights';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  // Lightweight lookup — metadata only needs identity/visibility, not the full
  // standings/leaderboard payload the page assembles.
  const auth = createServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  const meta = await getLeagueMeta(params.slug);
  if (!meta) return { title: 'League not found' };
  const isPrivate = meta.visibility === 'signed_in';
  if (isPrivate && !user) return { title: meta.name, robots: { index: false, follow: false } };
  return {
    title: `${meta.name} — Standings & Leaders`,
    description: `${meta.name} standings, statistical leaders, and recent results.`,
    robots: isPrivate ? { index: false, follow: false } : undefined,
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
  // Authenticated viewers get their active team marked across the leaderboards.
  const activeTeam = user ? await getActiveTeam(auth, user.id) : null;
  const data = await getLeagueHomeData(
    params.slug,
    !!user,
    searchParams.season,
    activeTeam ? { id: activeTeam.id, name: activeTeam.name } : null,
  );

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

  const enabled = new Set(data.theme.sections.filter((s) => s.enabled).map((s) => s.id));
  // Custom boards live under the Special tab — but only when the league enabled
  // the customLeaders section. The season switcher lives in the hero; fall back to
  // the standings heading only when the hero section is disabled.
  const special = [
    ...data.defaultBoards.special,
    ...(enabled.has('customLeaders') ? data.customBoards : []),
  ];
  const showSeasonFallback = !enabled.has('hero');
  const teamIds = teamIdByName(data.standings);

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
            seasons={data.seasons}
            activeSeason={data.season}
            slug={params.slug}
            updatedAt={data.updatedAt}
          />
        );
      case 'standings': {
        const hasDivisions = data.divisions.length > 0;
        return (
          <section key="standings">
            <SectionHeading
              title="Standings"
              seasons={showSeasonFallback ? data.seasons : []}
              active={data.season}
              slug={params.slug}
            />
            {hasDivisions ? (
              <div className="space-y-6">
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-app-fg-muted">League</h3>
                  <StandingsTable rows={data.standings} slug={params.slug} season={data.season} />
                </div>
                {data.divisions.map((div) => (
                  <div key={div.id} className="space-y-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-app-fg-muted">
                      {div.name}
                    </h3>
                    <StandingsTable rows={div.rows} slug={params.slug} season={data.season} />
                  </div>
                ))}
              </div>
            ) : (
              <StandingsTable rows={data.standings} slug={params.slug} season={data.season} />
            )}
          </section>
        );
      }
      case 'spotlights':
        return <Spotlights key="spotlights" items={data.spotlights} slug={params.slug} season={data.season} teamIdByName={teamIds} />;
      case 'leaders':
        return (
          <LeadersSection
            key="leaders"
            boards={{
              batting: data.defaultBoards.batting,
              pitching: data.defaultBoards.pitching,
              team: data.defaultBoards.team,
              special,
            }}
            slug={params.slug}
            season={data.season}
          />
        );
      case 'customLeaders':
        // Custom boards are surfaced inside the Special tab of the Leaders section.
        return null;
      case 'recent':
        return (
          <section key="recent">
            <h2 className="display mb-3 text-xl font-bold">Around the League</h2>
            <RecentUpcoming recent={data.recent} upcoming={data.upcoming} slug={params.slug} season={data.season} />
          </section>
        );
      default:
        return null;
    }
  };

  return (
    <main className={`league-scheme-${data.theme.colorScheme} mx-auto max-w-5xl space-y-8 p-4 md:p-8`}>
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
      <h2 className="display text-xl font-bold">{title}</h2>
      {seasons.length > 1 ? (
        <div className="inline-flex rounded-lg border border-app-border bg-app-surface-2 p-0.5 text-sm">
          {seasons.map((s) => (
            <a
              key={s}
              href={`/l/${slug}?season=${encodeURIComponent(s)}`}
              aria-current={s === active ? 'true' : undefined}
              className={`rounded-md px-2.5 py-1 font-semibold transition-colors ${
                s === active ? 'bg-app-surface text-app-fg shadow-sm' : 'text-app-fg-muted hover:text-app-fg'
              }`}
            >
              {s}
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}
