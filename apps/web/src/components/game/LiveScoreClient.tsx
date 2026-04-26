'use client';
import type { JSX } from 'react';

import { useEffect, useState } from 'react';
import { createBrowserClient } from '@/lib/supabase/client';
import type { Database } from '@baseball/database';
import { weAreHome } from '@baseball/shared';
import { DiamondField } from '@/components/ui/DiamondField';
import { LiveChip } from '@/components/ui/LiveChip';

type Game = Database['public']['Tables']['games']['Row'];

interface LiveScoreClientProps {
  gameId: string;
  initialGame: Game;
  teamName?: string;
}

/**
 * Public-facing live score viewer. Hero scoreboard with DiamondField.
 * Subscribes to Supabase Realtime for live score + inning updates.
 */
export function LiveScoreClient({ gameId, initialGame, teamName }: LiveScoreClientProps): JSX.Element | null {
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

  const halfLabel = game.is_top_of_inning ? 'Top' : 'Bot';
  const usName = teamName ?? 'Our team';
  const isLive = game.status === 'in_progress';
  const isComplete = game.status === 'completed';
  const weHome = weAreHome(game.location_type, game.neutral_home_team);
  const opponentLabel = game.opponent_name ?? 'TBD';
  const awaySub = weHome ? opponentLabel : usName;
  const homeSub = weHome ? usName : opponentLabel;

  return (
    <div className="card card-hero" style={{ padding: 24, borderRadius: 18 }}>
      <div className="between" style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: 20 }}>
        <div>
          <div className="eyebrow" style={{ color: 'var(--turf-200)', display: 'flex', alignItems: 'center', gap: 8 }}>
            {isLive && <LiveChip />}
            {isLive
              ? `${halfLabel} of ${game.current_inning}`
              : isComplete
                ? 'Final'
                : 'Scheduled'}
          </div>
          <div className="display" style={{ fontSize: 'clamp(28px, 6vw, 46px)', marginTop: 8, color: 'white' }}>
            {usName}{' '}
            <span
              style={{
                opacity: 0.55,
                fontFamily: 'var(--font-sans)',
                fontWeight: 500,
                fontSize: 'clamp(16px, 3vw, 24px)',
              }}
            >
              vs
            </span>{' '}
            {opponentLabel}
          </div>
          <div style={{ color: 'rgba(255,255,255,.7)', marginTop: 4, fontSize: 13 }}>
            {game.venue_name ?? 'Venue TBD'} ·{' '}
            {new Date(game.scheduled_at).toLocaleString([], {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            })}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 28, alignItems: 'center', marginLeft: 'auto' }}>
          <ScoreBlock label="Away" score={game.away_score} sub={awaySub} />
          <div
            style={{
              color: 'rgba(255,255,255,.3)',
              fontSize: 24,
              fontFamily: 'var(--font-display)',
              fontStyle: 'italic',
            }}
          >
            vs
          </div>
          <ScoreBlock label="Home" score={game.home_score} sub={homeSub} />
        </div>
      </div>

      {isLive && (
        <div
          style={{
            marginTop: 22,
            display: 'grid',
            gridTemplateColumns: 'auto 1fr',
            gap: 20,
            alignItems: 'center',
            padding: '14px 0 0',
            borderTop: '1px solid rgba(255,255,255,.1)',
          }}
        >
          <DiamondField runners={{ first: false, second: false, third: false }} size={140} variant="energetic" />
          <div>
            <div className="eyebrow" style={{ color: 'var(--turf-200)' }}>Status</div>
            <div className="display" style={{ fontSize: 28, color: 'white', marginTop: 4 }}>
              {halfLabel} {game.current_inning} · {game.outs} out{game.outs === 1 ? '' : 's'}
            </div>
            <div style={{ color: 'rgba(255,255,255,.65)', marginTop: 4, fontSize: 13 }}>
              Live updates refresh automatically.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ScoreBlock({ label, score, sub }: { label: string; score: number; sub: string }): JSX.Element {
  return (
    <div style={{ textAlign: 'center' }}>
      <div
        style={{
          fontSize: 11,
          color: 'rgba(255,255,255,.6)',
          letterSpacing: '.1em',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </div>
      <div
        className="mono"
        style={{
          fontSize: 'clamp(40px, 9vw, 64px)',
          fontWeight: 800,
          lineHeight: 1,
          color: 'white',
          fontFamily: 'var(--font-display)',
          marginTop: 2,
        }}
      >
        {score}
      </div>
      <div style={{ fontSize: 12, color: 'rgba(255,255,255,.75)', marginTop: 4 }}>{sub}</div>
    </div>
  );
}
