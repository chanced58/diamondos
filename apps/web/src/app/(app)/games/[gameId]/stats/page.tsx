import type { JSX } from 'react';
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { getUserAccess } from '@/lib/user-access';
import { loadGameStats } from '@/lib/game-stats/load-game-stats';
import { GameStatsClient } from './GameStatsClient';

export const metadata: Metadata = { title: 'Game Stats' };

export default async function GameStatsPage({
  params,
}: {
  params: { gameId: string };
}): Promise<JSX.Element | null> {
  const auth = createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return null;

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const bundle = await loadGameStats(db, params.gameId);
  if (!bundle) notFound();

  const { game, teamName, isHome } = bundle;

  const { isCoach, isPlatformAdmin } = await getUserAccess(game.teamId, user.id);

  if (!isCoach && !isPlatformAdmin) {
    const { data: membership } = await db
      .from('team_members')
      .select('role')
      .eq('team_id', game.teamId)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single();
    if (!membership) notFound();
  }

  // Only show stats for games that have been started (in_progress or completed)
  if (['scheduled', 'cancelled', 'postponed'].includes(game.status)) {
    return (
      <div className="p-8 max-w-2xl">
        <Link href={`/games/${params.gameId}`} className="text-sm text-brand-700 hover:underline">
          ← Back to game
        </Link>
        <p className="mt-6 text-gray-500">Stats are available once the game has started.</p>
      </div>
    );
  }

  const { lineScore } = bundle;
  const canExport = isCoach || isPlatformAdmin;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-gray-200 bg-white">
        <Link href={`/games/${params.gameId}`} className="text-sm text-brand-700 hover:underline">
          ← Back to game
        </Link>
        <div className="flex items-center justify-between mt-2">
          <h1 className="text-lg font-bold text-gray-900">
            {teamName} vs {game.opponentName}
          </h1>
          <div className="flex items-center gap-2">
            {canExport && (
              <a
                href={`/api/games/${params.gameId}/export`}
                download
                className="text-xs font-semibold px-3 py-1 rounded-full border border-brand-300 text-brand-700 hover:bg-brand-50"
              >
                Export to Home Team
              </a>
            )}
            <span className="text-xl font-bold text-gray-900">
              {isHome
                ? `${lineScore.homeRuns} – ${lineScore.awayRuns}`
                : `${lineScore.awayRuns} – ${lineScore.homeRuns}`}
            </span>
            <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
              game.status === 'completed'
                ? 'bg-gray-100 text-gray-600'
                : 'bg-green-100 text-green-700'
            }`}>
              {game.status === 'completed' ? 'Final' : 'Live'}
            </span>
          </div>
        </div>
      </div>

      {/* Stats client */}
      <div className="flex-1 overflow-auto">
        <GameStatsClient
          game={{
            id: game.id,
            opponentName: game.opponentName ?? '',
            locationType: game.locationType,
            neutralHomeTeam: game.neutralHomeTeam,
            status: game.status,
            teamName,
          }}
          ourBatting={bundle.ourBatting}
          oppBatting={bundle.oppBatting}
          ourPitching={bundle.ourPitching}
          oppPitching={bundle.oppPitching}
          ourFielding={bundle.ourFielding}
          oppFielding={bundle.oppFielding}
          lineScore={lineScore}
          baserunning={bundle.baserunning}
        />
      </div>
    </div>
  );
}
