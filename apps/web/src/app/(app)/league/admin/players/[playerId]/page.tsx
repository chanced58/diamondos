import type { JSX } from 'react';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { getLeagueAccess } from '@/lib/league-access';
import { getLeagueForStaff, getPlayerTransfers } from '@baseball/database';
import { TransferHistoryTimeline } from './TransferHistoryTimeline';

export default async function PlayerDetailPage({
  params,
}: {
  params: { playerId: string };
}): Promise<JSX.Element | null> {
  const auth = createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) redirect('/login');

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const staffLeague = await getLeagueForStaff(db, user.id);
  if (!staffLeague) redirect('/dashboard');

  const access = await getLeagueAccess(staffLeague.id, user.id);
  if (!access.isLeagueStaff) redirect('/dashboard');

  const { data: lp } = await db
    .from('league_players')
    .select('player_id')
    .eq('league_id', staffLeague.id)
    .eq('player_id', params.playerId)
    .maybeSingle();
  if (!lp) notFound();

  type PlayerDetail = {
    id: string;
    first_name: string;
    last_name: string;
    jersey_number: number | null;
    date_of_birth: string | null;
    primary_position: string | null;
    bats: string | null;
    throws: string | null;
    graduation_year: number | null;
    team_id: string | null;
    team: { id: string; name: string } | { id: string; name: string }[] | null;
  };

  const { data: playerRow } = await db
    .from('players')
    .select(
      'id, first_name, last_name, jersey_number, date_of_birth, primary_position, ' +
      'bats, throws, graduation_year, team_id, team:teams(id, name)'
    )
    .eq('id', params.playerId)
    .single();
  if (!playerRow) notFound();
  const player = playerRow as unknown as PlayerDetail;

  const transfers = await getPlayerTransfers(db, params.playerId);
  const currentTeam = Array.isArray(player.team) ? player.team[0] : player.team;

  return (
    <div className="p-8 max-w-3xl space-y-6">
      <Link href="/league/admin/players" className="text-sm text-brand-700 hover:underline">
        ← Back to League Players
      </Link>
      <header>
        <h1 className="text-2xl font-bold text-gray-900">
          {player.first_name} {player.last_name}
        </h1>
        <p className="text-gray-500">
          {currentTeam?.name ?? <span className="text-amber-700">Free agent</span>}
          {player.jersey_number != null && <span className="ml-2">#{player.jersey_number}</span>}
        </p>
      </header>

      <section className="bg-white border border-gray-200 rounded-xl p-6 grid grid-cols-2 gap-4 text-sm">
        <Field label="Date of birth" value={player.date_of_birth ?? '—'} />
        <Field label="Graduation year" value={player.graduation_year?.toString() ?? '—'} />
        <Field label="Primary position" value={player.primary_position ?? '—'} />
        <Field label="Bats / Throws" value={`${player.bats ?? '—'} / ${player.throws ?? '—'}`} />
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Transfer History</h2>
        <TransferHistoryTimeline transfers={transfers} />
      </section>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div>
      <div className="text-xs font-medium text-gray-500 uppercase">{label}</div>
      <div className="text-gray-900">{value}</div>
    </div>
  );
}
