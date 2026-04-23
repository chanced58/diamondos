import type { JSX } from 'react';
import { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { getUserAccess } from '@/lib/user-access';
import { InjuryFlagForm } from './InjuryFlagForm';
import { InjuryFlagList } from './InjuryFlagList';
import { localDateYmd } from '@/lib/local-date';

export const metadata: Metadata = { title: 'Player Availability' };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AvailabilityPage({
  params,
}: {
  params: { teamId: string; playerId: string };
}): Promise<JSX.Element | null> {
  // Defensive: params come from URL routing and are interpolated into a
  // PostgREST .or() filter below; reject anything that isn't a UUID before
  // it reaches the DB.
  if (!UUID_RE.test(params.teamId) || !UUID_RE.test(params.playerId)) notFound();

  const auth = createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) redirect('/login');

  const access = await getUserAccess(params.teamId, user.id);
  if (!access.isCoach) redirect(`/teams/${params.teamId}/roster/${params.playerId}`);

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const [playerResult, catalogResult, flagsResult] = await Promise.all([
    db
      .from('players')
      .select('id, team_id, first_name, last_name, jersey_number')
      .eq('id', params.playerId)
      .eq('team_id', params.teamId)
      .single(),
    db
      .from('injury_flag_catalog')
      .select('slug, name, body_part, description, visibility, team_id')
      .or(`visibility.eq.system,team_id.eq.${params.teamId}`)
      .order('name'),
    db
      .from('player_injury_flags')
      .select('id, injury_slug, effective_from, effective_to, notes, created_at')
      .eq('player_id', params.playerId)
      .order('effective_from', { ascending: false }),
  ]);

  if (!playerResult.data) notFound();
  const player = playerResult.data;
  const catalog = catalogResult.data ?? [];
  const flags = flagsResult.data ?? [];

  const catalogBySlug = new Map(catalog.map((c) => [c.slug, c]));
  const today = localDateYmd();

  // Active = window includes today (start <= today, no end or end >= today).
  // Upcoming = starts in the future. Past = ended before today.
  const activeFlags = flags.filter(
    (f) =>
      f.effective_from <= today &&
      (!f.effective_to || f.effective_to >= today),
  );
  const upcomingFlags = flags.filter((f) => f.effective_from > today);
  const pastFlags = flags.filter((f) => f.effective_to && f.effective_to < today);

  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-6">
        <Link
          href={`/teams/${params.teamId}/roster/${params.playerId}`}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          ← Back to player
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-2">
          Availability — {player.first_name} {player.last_name}
          {player.jersey_number != null && (
            <span className="text-gray-400 font-normal"> #{player.jersey_number}</span>
          )}
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          Active injury and availability flags suppress drills tagged as contraindicated in the AI drill recommender.
        </p>
      </div>

      {activeFlags.length > 0 && (
        <section className="mb-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-2">Active flags</h2>
          <InjuryFlagList
            teamId={params.teamId}
            playerId={params.playerId}
            flags={activeFlags}
            catalogBySlug={catalogBySlug}
            variant="active"
          />
        </section>
      )}

      {upcomingFlags.length > 0 && (
        <section className="mb-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-2">Upcoming flags</h2>
          <InjuryFlagList
            teamId={params.teamId}
            playerId={params.playerId}
            flags={upcomingFlags}
            catalogBySlug={catalogBySlug}
            variant="past"
          />
        </section>
      )}

      <section className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
        <h2 className="text-sm font-semibold text-gray-900 mb-3">Add a flag</h2>
        <InjuryFlagForm
          teamId={params.teamId}
          playerId={params.playerId}
          catalog={catalog}
        />
      </section>

      {pastFlags.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-900 mb-2">Past flags</h2>
          <InjuryFlagList
            teamId={params.teamId}
            playerId={params.playerId}
            flags={pastFlags}
            catalogBySlug={catalogBySlug}
            variant="past"
          />
        </section>
      )}
    </div>
  );
}
