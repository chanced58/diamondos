import type { JSX } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { getActiveTeam } from '@/lib/active-team';
import { getUserAccess } from '@/lib/user-access';
import { getLatestScoutingCard } from '@baseball/database';
import { ScoutingCardClient } from './ScoutingCardClient';

export const metadata: Metadata = { title: 'Scouting card' };

export default async function ScoutingCardPage({
  params,
}: {
  params: Promise<{ opponentTeamId: string }>;
}): Promise<JSX.Element | null> {
  const { opponentTeamId } = await params;

  const auth = createServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) redirect('/login');

  const activeTeam = await getActiveTeam(auth, user.id);
  if (!activeTeam) redirect('/dashboard');

  const { isCoach } = await getUserAccess(activeTeam.id, user.id);
  if (!isCoach) redirect('/games/opponents');

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: oppTeam } = await db
    .from('opponent_teams')
    .select('id, name, city, state_code, team_id')
    .eq('id', opponentTeamId)
    .maybeSingle();
  if (!oppTeam || oppTeam.team_id !== activeTeam.id) {
    redirect('/games/opponents');
  }

  const { count: priorGames } = await db
    .from('games')
    .select('id', { count: 'exact', head: true })
    .eq('team_id', activeTeam.id)
    .eq('opponent_team_id', opponentTeamId);

  const existingCard = await getLatestScoutingCard(
    db as never,
    opponentTeamId,
    activeTeam.id,
  );

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-6">
        <Link
          href={`/games/opponents/${opponentTeamId}`}
          className="text-sm text-brand-700 hover:underline"
        >
          ← Back to {oppTeam.name}
        </Link>
        <div className="flex items-baseline justify-between mt-2">
          <h1 className="text-2xl font-bold text-gray-900">
            Scouting card — {oppTeam.name}
          </h1>
          {existingCard && (
            <Link
              href={`/games/opponents/${opponentTeamId}/card/print`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm bg-white border border-gray-300 font-semibold px-3 py-1.5 rounded-md hover:bg-gray-50"
            >
              Print card
            </Link>
          )}
        </div>
        <p className="text-gray-500 text-sm mt-1">
          {oppTeam.city && (
            <>
              {oppTeam.city}
              {oppTeam.state_code ? `, ${oppTeam.state_code}` : ''} ·{' '}
            </>
          )}
          {priorGames ?? 0} prior game{priorGames === 1 ? '' : 's'} on record
        </p>
      </div>

      <ScoutingCardClient
        opponentTeamId={opponentTeamId}
        opponentName={oppTeam.name as string}
        priorGames={priorGames ?? 0}
        initialCard={existingCard}
      />
    </div>
  );
}
