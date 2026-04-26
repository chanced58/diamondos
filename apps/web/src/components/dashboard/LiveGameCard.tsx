'use client';

import { useEffect, useMemo, useState, type JSX } from 'react';
import Link from 'next/link';
import {
  deriveGameState,
  filterResetAndReverted,
  weAreHome,
  type EventType,
  type GameEvent,
  type LiveGameState,
} from '@baseball/shared';
import type { Database } from '@baseball/database';
import { createBrowserClient } from '@/lib/supabase/client';
import { DiamondField } from '@/components/ui/DiamondField';
import { LiveChip } from '@/components/ui/LiveChip';

type GameRow = Database['public']['Tables']['games']['Row'];
type EventRow = Database['public']['Tables']['game_events']['Row'];

interface LiveGameCardProps {
  game: GameRow;
  initialEvents: EventRow[];
  teamName: string;
}

function rowToGameEvent(r: EventRow): GameEvent {
  return {
    id: r.id,
    gameId: r.game_id,
    sequenceNumber: r.sequence_number,
    eventType: r.event_type as EventType,
    inning: r.inning,
    isTopOfInning: r.is_top_of_inning,
    payload: (r.payload ?? {}) as GameEvent['payload'],
    occurredAt: r.occurred_at,
    createdBy: r.created_by ?? '',
    deviceId: r.device_id,
    syncedAt: r.synced_at ?? undefined,
  };
}

export function LiveGameCard({
  game: initialGame,
  initialEvents,
  teamName,
}: LiveGameCardProps): JSX.Element | null {
  const [game, setGame] = useState<GameRow>(initialGame);
  const [events, setEvents] = useState<EventRow[]>(initialEvents);
  const supabase = createBrowserClient();

  useEffect(() => {
    const channel = supabase
      .channel(`dashboard-live-${game.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'game_events',
          filter: `game_id=eq.${game.id}`,
        },
        (payload) => {
          const next = payload.new as EventRow;
          setEvents((prev) => {
            if (prev.some((e) => e.id === next.id)) return prev;
            return [...prev, next].sort(
              (a, b) => a.sequence_number - b.sequence_number,
            );
          });
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'games',
          filter: `id=eq.${game.id}`,
        },
        (payload) => {
          setGame(payload.new as GameRow);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [game.id, supabase]);

  const state = useMemo<LiveGameState>(() => {
    const filtered = filterResetAndReverted(
      events as unknown as Record<string, unknown>[],
    ) as unknown as EventRow[];
    return deriveGameState(game.id, filtered.map(rowToGameEvent), game.team_id);
  }, [events, game.id, game.team_id]);

  if (game.status !== 'in_progress') return null;

  const weHome = weAreHome(game.location_type, game.neutral_home_team);
  const opponentLabel = game.opponent_name ?? 'TBD';
  const halfLabel = state.isTopOfInning ? 'Top' : 'Bot';
  const ourScore = weHome ? state.homeScore : state.awayScore;
  const theirScore = weHome ? state.awayScore : state.homeScore;
  const runners = {
    first: !!state.runnersOnBase.first,
    second: !!state.runnersOnBase.second,
    third: !!state.runnersOnBase.third,
  };

  return (
    <div className="card card-hero" style={{ padding: 24, borderRadius: 18 }}>
      <div
        className="between"
        style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: 20 }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            className="eyebrow"
            style={{
              color: 'var(--turf-200)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <LiveChip />
            {halfLabel} of {state.inning}
          </div>
          <div
            className="display"
            style={{
              fontSize: 'clamp(24px, 5vw, 38px)',
              marginTop: 8,
              color: 'white',
              letterSpacing: '-0.02em',
            }}
          >
            {teamName}{' '}
            <span
              style={{
                opacity: 0.55,
                fontFamily: 'var(--font-sans)',
                fontWeight: 500,
                fontSize: 'clamp(14px, 2.5vw, 20px)',
              }}
            >
              {weHome ? 'vs' : '@'}
            </span>{' '}
            {opponentLabel}
          </div>
          {game.venue_name && (
            <div
              style={{
                color: 'rgba(255,255,255,.7)',
                marginTop: 4,
                fontSize: 13,
              }}
            >
              {game.venue_name}
            </div>
          )}
        </div>

        <div
          style={{
            display: 'flex',
            gap: 22,
            alignItems: 'center',
            marginLeft: 'auto',
          }}
        >
          <ScoreBlock label="Us" score={ourScore} />
          <div
            style={{
              color: 'rgba(255,255,255,.3)',
              fontSize: 22,
              fontFamily: 'var(--font-display)',
              fontStyle: 'italic',
            }}
          >
            vs
          </div>
          <ScoreBlock label="Them" score={theirScore} />
        </div>
      </div>

      <div
        style={{
          marginTop: 18,
          display: 'grid',
          gridTemplateColumns: 'auto 1fr auto',
          gap: 20,
          alignItems: 'center',
          padding: '14px 0 0',
          borderTop: '1px solid rgba(255,255,255,.1)',
        }}
      >
        <DiamondField runners={runners} size={120} variant="energetic" />
        <div style={{ minWidth: 0 }}>
          <div className="eyebrow" style={{ color: 'var(--turf-200)' }}>
            Count
          </div>
          <div
            className="display"
            style={{ fontSize: 26, color: 'white', marginTop: 4 }}
          >
            <span className="mono">
              {state.balls}-{state.strikes}
            </span>
            <span
              style={{
                opacity: 0.55,
                fontWeight: 500,
                marginLeft: 12,
                fontSize: 18,
              }}
            >
              {state.outs} out{state.outs === 1 ? '' : 's'}
            </span>
          </div>
          <div
            style={{
              color: 'rgba(255,255,255,.6)',
              marginTop: 6,
              fontSize: 12,
            }}
          >
            Live updates refresh automatically.
          </div>
        </div>
        <Link
          href={`/live/${game.id}`}
          className="btn btn-turf"
          style={{ alignSelf: 'center', whiteSpace: 'nowrap' }}
        >
          Watch live →
        </Link>
      </div>
    </div>
  );
}

function ScoreBlock({
  label,
  score,
}: {
  label: string;
  score: number;
}): JSX.Element {
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
          fontSize: 'clamp(36px, 7vw, 56px)',
          fontWeight: 800,
          lineHeight: 1,
          color: 'white',
          fontFamily: 'var(--font-display)',
          marginTop: 2,
        }}
      >
        {score}
      </div>
    </div>
  );
}
