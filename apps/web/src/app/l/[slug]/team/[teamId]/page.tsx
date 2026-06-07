import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { createServerClient } from '@/lib/supabase/server';
import { getTeamStatPageData, getTeamMeta } from '@/lib/league-home/team-load';
import { TeamHero } from './_components/TeamHero';
import { TeamStatPanel } from './_components/TeamStatPanel';
import { TeamBattingTable } from './_components/TeamBattingTable';
import { TeamPitchingTable } from './_components/TeamPitchingTable';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: { slug: string; teamId: string };
}): Promise<Metadata> {
  const auth = createServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  const meta = await getTeamMeta(params.slug, params.teamId);
  if (!meta) return { title: 'Team not found' };
  const isPrivate = meta.visibility === 'signed_in';
  if (isPrivate && !user) return { title: meta.leagueName, robots: { index: false, follow: false } };
  return {
    title: `${meta.teamName} — ${meta.leagueName}`,
    description: `${meta.teamName} record and player statistics in ${meta.leagueName}.`,
    robots: isPrivate ? { index: false, follow: false } : undefined,
  };
}

export default async function TeamStatPage({
  params,
  searchParams,
}: {
  params: { slug: string; teamId: string };
  searchParams: { season?: string };
}): Promise<JSX.Element> {
  const auth = createServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  const data = await getTeamStatPageData(params.slug, params.teamId, !!user, searchParams.season);

  if ('notFound' in data) notFound();
  if ('blocked' in data) {
    return (
      <main className="mx-auto max-w-md p-12 text-center">
        <h1 className="text-2xl font-bold">{data.league.name}</h1>
        <p className="mt-2 text-slate-600">This league is visible to signed-in users only.</p>
        <a
          href={`/login?redirectTo=/l/${data.slug}/team/${params.teamId}`}
          className="mt-4 inline-block rounded bg-slate-900 px-4 py-2 text-white"
        >
          Sign in
        </a>
      </main>
    );
  }

  return (
    <main className={`league-scheme-${data.theme.colorScheme} mx-auto max-w-5xl space-y-8 p-4 md:p-8`}>
      <TeamHero
        slug={data.slug}
        season={data.season}
        leagueName={data.league.name}
        team={data.team}
        record={data.record}
        rank={data.rank}
        divisionName={data.divisionName}
      />
      <TeamStatPanel stats={data.teamStats} />
      <section>
        <h2 className="display mb-3 text-xl font-bold">Batting</h2>
        <TeamBattingTable players={data.players} />
      </section>
      <section>
        <h2 className="display mb-3 text-xl font-bold">Pitching</h2>
        <TeamPitchingTable players={data.players} />
      </section>
    </main>
  );
}
