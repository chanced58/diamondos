import { createServerClient } from '@/lib/supabase/server';
import { getGameById } from '@baseball/database';
import { LiveScoreClient } from '@/components/game/LiveScoreClient';
import { Metadata } from 'next';

interface Props {
  params: { gameId: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const supabase = createServerClient();
  const game = await getGameById(supabase, params.gameId).catch(() => null);
  if (!game) return { title: 'Live Game' };
  return { title: `Live: ${game.opponent_name}` };
}

/**
 * Public-facing live score page (no auth required).
 * Initial data is SSR'd; real-time updates are handled by LiveScoreClient.
 */
export default async function LiveGamePage({ params }: Props): Promise<JSX.Element | null> {
  const supabase = createServerClient();
  const game = await getGameById(supabase, params.gameId).catch(() => null);

  if (!game) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">Game not found.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-900 text-white">
      <div className="max-w-xl mx-auto px-4 pt-8 pb-16">
        <p className="text-blue-300 text-sm text-center mb-2">LIVE</p>
        <LiveScoreClient gameId={params.gameId} initialGame={game} />
        <p className="text-center text-blue-400 text-xs mt-8">
          Powered by Baseball Coaches App
        </p>
      </div>
    </div>
  );
}
