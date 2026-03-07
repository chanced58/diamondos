'use client';
import type { JSX } from 'react';

import { useEffect, useState } from 'react';
import { createBrowserClient } from '@/lib/supabase/client';
import type { Database } from '@baseball/database';

type Game = Database['public']['Tables']['games']['Row'];

interface LiveScoreClientProps {
  gameId: string;
  initialGame: Game;
}

/**
 * Client component: subscribes to Supabase Realtime for live score updates.
 * Parents and remote viewers use this page.
 */
export function LiveScoreClient({ gameId, initialGame }: LiveScoreClientProps): JSX.Element | null {
  const [game, setGame] = useState<Game>(initialGame);
  const supabase = createBrowserClient();

  useEffect(() => {
    const channel = supabase
      .channel(`live-game-${gameId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'games',
          filter: `id=eq.${gameId}`,
        },
        (payload) => {
          setGame(payload.new as Game);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [gameId, supabase]);

  const inningLabel = game.is_top_of_inning
    ? `Top ${game.current_inning}`
    : `Bot ${game.current_inning}`;

  return (
    <div className="text-center">
      <h1 className="text-2xl font-bold mb-1">{game.opponent_name}</h1>
      <p className="text-blue-300 text-sm mb-8">{inningLabel} • {game.outs} out{game.outs !== 1 ? 's' : ''}</p>

      <div className="flex items-center justify-center gap-16 mb-8">
        <div>
          <p className="text-blue-300 text-xs uppercase tracking-wide mb-1">Home</p>
          <p className="text-6xl font-bold">{game.home_score}</p>
        </div>
        <div className="text-blue-400 text-2xl font-light">—</div>
        <div>
          <p className="text-blue-300 text-xs uppercase tracking-wide mb-1">Away</p>
          <p className="text-6xl font-bold">{game.away_score}</p>
        </div>
      </div>

      {game.status !== 'in_progress' && (
        <p className="text-blue-300 text-sm capitalize">{game.status}</p>
      )}
    </div>
  );
}
