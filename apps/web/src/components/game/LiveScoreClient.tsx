'use client';
import type { JSX, ReactNode } from 'react';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createBrowserClient } from '@/lib/supabase/client';
import type { Database } from '@baseball/database';
import {
  deriveGameState,
  filterResetAndReverted,
  weAreHome,
  type EventType,
  type GameEvent,
  type LiveGameState,
} from '@baseball/shared';
import { DiamondField } from '@/components/ui/DiamondField';
import { LiveChip } from '@/components/ui/LiveChip';
import { formatPlayer, type PlayerNameMap } from '@/lib/live/player-name-map';
import { formatEventTicker } from '@/lib/live/format-event-ticker';

type Game = Database['public']['Tables']['games']['Row'];
type EventRow = Database['public']['Tables']['game_events']['Row'];

interface LiveScoreClientProps {
  gameId: string;
  initialGame: Game;
  initialEvents: EventRow[];
  teamName?: string;
  playerNameMap: PlayerNameMap;
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

/**
 * Public-facing live score viewer. Hero scoreboard with DiamondField.
 * Subscribes to game_events INSERTs and games UPDATEs over Supabase Realtime,
 * derives current state, and renders subtle animations on transitions.
 */
export function LiveScoreClient({
  gameId,
  initialGame,
  initialEvents,
  teamName,
  playerNameMap,
}: LiveScoreClientProps): JSX.Element | null {
  const [game, setGame] = useState<Game>(initialGame);
  const [events, setEvents] = useState<EventRow[]>(initialEvents);
  const supabase = createBrowserClient();

  useEffect(() => {
    let cancelled = false;

    const mergeRow = (next: EventRow) => {
      setEvents((prev) => {
        if (prev.some((e) => e.id === next.id)) return prev;
        return [...prev, next].sort(
          (a, b) => a.sequence_number - b.sequence_number,
        );
      });
    };

    const channel = supabase
      .channel(`live-game-${gameId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'game_events',
          filter: `game_id=eq.${gameId}`,
        },
        (payload) => mergeRow(payload.new as EventRow),
      )
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
      .subscribe((status) => {
        // Close the SSR-to-subscribe gap: events inserted while we were
        // hydrating + opening the channel won't arrive over realtime.
        // Once subscribed, fetch anything past our current high-water mark
        // and merge it through the same dedupe path.
        if (status !== 'SUBSCRIBED' || cancelled) return;
        const highWater = events.length > 0
          ? events[events.length - 1].sequence_number
          : 0;
        void supabase
          .from('game_events')
          .select('*')
          .eq('game_id', gameId)
          .gt('sequence_number', highWater)
          .order('sequence_number')
          .then(({ data, error }) => {
            if (cancelled) return;
            if (error) {
              console.error(`[LiveScoreClient] Failed backfill for gameId=${gameId}:`, error);
              return;
            }
            for (const row of (data ?? []) as EventRow[]) mergeRow(row);
          });
      });

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
    // `events` intentionally omitted: only the value at subscribe time
    // matters (read inside the SUBSCRIBED callback). Re-running on every
    // event would tear down + recreate the channel.
  }, [gameId, supabase]);

  const state = useMemo<LiveGameState>(() => {
    const filtered = filterResetAndReverted(
      events as unknown as Record<string, unknown>[],
    ) as unknown as EventRow[];
    return deriveGameState(game.id, filtered.map(rowToGameEvent), game.team_id);
  }, [events, game.id, game.team_id]);

  // Walk backwards through events to find the most recent renderable
  // ticker line. Some event types (PITCH_REVERTED, EVENT_VOIDED, etc.)
  // intentionally produce no ticker — without this walk-back the panel
  // would unmount whenever one of those was the latest event.
  const { tickerText, tickerEventId } = useMemo<{
    tickerText: string | null;
    tickerEventId: string | null;
  }>(() => {
    for (let i = events.length - 1; i >= 0; i--) {
      const text = formatEventTicker(events[i], playerNameMap);
      if (text !== null) return { tickerText: text, tickerEventId: events[i].id };
    }
    return { tickerText: null, tickerEventId: null };
  }, [events, playerNameMap]);

  // ─── Animation diff: pulse new base arrivals + flash count on changes ───
  const prevState = useRef<LiveGameState | null>(null);
  // Hold the pulse-reset timer in a ref so subsequent state changes
  // (e.g. count updates that re-run this effect) don't tear it down via
  // useEffect cleanup mid-pulse.
  const pulseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pulseBases, setPulseBases] = useState<{ first: boolean; second: boolean; third: boolean }>({
    first: false,
    second: false,
    third: false,
  });
  const [countFlashKey, setCountFlashKey] = useState(0);

  useEffect(() => {
    const before = prevState.current;
    if (before) {
      const next = {
        first: !before.runnersOnBase.first && !!state.runnersOnBase.first,
        second: !before.runnersOnBase.second && !!state.runnersOnBase.second,
        third: !before.runnersOnBase.third && !!state.runnersOnBase.third,
      };
      if (next.first || next.second || next.third) {
        if (pulseTimeoutRef.current !== null) clearTimeout(pulseTimeoutRef.current);
        setPulseBases(next);
        pulseTimeoutRef.current = setTimeout(() => {
          setPulseBases({ first: false, second: false, third: false });
          pulseTimeoutRef.current = null;
        }, 750);
      }
      if (
        before.balls !== state.balls ||
        before.strikes !== state.strikes ||
        before.outs !== state.outs
      ) {
        setCountFlashKey((k) => k + 1);
      }
    }
    prevState.current = state;
  }, [state]);

  useEffect(() => {
    return () => {
      if (pulseTimeoutRef.current !== null) clearTimeout(pulseTimeoutRef.current);
    };
  }, []);

  const halfLabel = state.isTopOfInning ? 'Top' : 'Bot';
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
          <div
            className="eyebrow"
            style={{ color: 'var(--turf-200)', display: 'flex', alignItems: 'center', gap: 8 }}
          >
            {isLive && <LiveChip />}
            {isLive
              ? `${halfLabel} of ${state.inning}`
              : isComplete
                ? 'Final'
                : 'Scheduled'}
          </div>
          <div
            className="display"
            style={{ fontSize: 'clamp(28px, 6vw, 46px)', marginTop: 8, color: 'white' }}
          >
            {usName}{' '}
            <span
              style={{
                opacity: 0.55,
                fontFamily: 'var(--font-sans)',
                fontWeight: 500,
                fontSize: 'clamp(16px, 3vw, 24px)',
              }}
            >
              {weHome ? 'vs' : '@'}
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
          <ScoreBlock label="Away" score={isLive ? state.awayScore : game.away_score} sub={awaySub} />
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
          <ScoreBlock label="Home" score={isLive ? state.homeScore : game.home_score} sub={homeSub} />
        </div>
      </div>

      {isLive && (
        <div
          style={{
            marginTop: 22,
            display: 'grid',
            gridTemplateColumns: 'auto 1fr',
            gap: 24,
            alignItems: 'center',
            padding: '14px 0 0',
            borderTop: '1px solid rgba(255,255,255,.1)',
          }}
        >
          <DiamondField
            runners={{
              first: !!state.runnersOnBase.first,
              second: !!state.runnersOnBase.second,
              third: !!state.runnersOnBase.third,
            }}
            pulseBases={pulseBases}
            size={160}
            variant="energetic"
          />

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
              gap: '16px 24px',
              minWidth: 0,
            }}
          >
            <Stat label="At bat">
              <FadeText
                key={`b-${state.currentBatterId ?? 'none'}`}
                value={formatPlayer(playerNameMap, state.currentBatterId)}
              />
            </Stat>
            <Stat label="Pitching">
              <FadeText
                key={`p-${state.currentPitcherId ?? 'none'}`}
                value={formatPlayer(playerNameMap, state.currentPitcherId)}
              />
            </Stat>
            <Stat label="On base">
              <div
                style={{
                  display: 'grid',
                  gap: 2,
                  fontSize: 13,
                  color: 'rgba(255,255,255,.85)',
                  lineHeight: 1.35,
                }}
              >
                <BaseRow base="1B" name={formatPlayer(playerNameMap, state.runnersOnBase.first)} />
                <BaseRow base="2B" name={formatPlayer(playerNameMap, state.runnersOnBase.second)} />
                <BaseRow base="3B" name={formatPlayer(playerNameMap, state.runnersOnBase.third)} />
              </div>
            </Stat>
            <Stat label="Count">
              <div
                key={countFlashKey}
                className={countFlashKey > 0 ? 'count-flash' : undefined}
                style={{ marginTop: 2, padding: '2px 6px', display: 'inline-block' }}
              >
                <span className="mono" style={{ fontSize: 20, color: 'white', fontWeight: 700 }}>
                  {state.balls}-{state.strikes}
                </span>
                <span style={{ opacity: 0.6, marginLeft: 8, fontSize: 13 }}>
                  · {state.outs} out{state.outs === 1 ? '' : 's'}
                </span>
              </div>
            </Stat>
          </div>

          {tickerText && (
            <div
              key={tickerEventId ?? 'no-event'}
              className="event-ticker-in"
              style={{
                gridColumn: '1 / -1',
                marginTop: 4,
                padding: '10px 14px',
                background: 'rgba(255,255,255,.05)',
                borderRadius: 10,
                color: 'white',
                fontSize: 14,
              }}
            >
              <span style={{ opacity: 0.55, marginRight: 8, fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase' }}>
                Last play
              </span>
              {tickerText}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FadeText({ value }: { value: string }): JSX.Element {
  return (
    <div
      className="player-fade-in"
      style={{
        color: 'white',
        marginTop: 4,
        fontSize: 16,
        fontWeight: 600,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}
    >
      {value}
    </div>
  );
}

function Stat({ label, children }: { label: string; children: ReactNode }): JSX.Element {
  return (
    <div style={{ minWidth: 0 }}>
      <div
        className="eyebrow"
        style={{
          color: 'var(--turf-200)',
          fontSize: 10,
          letterSpacing: '.12em',
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

function BaseRow({ base, name }: { base: string; name: string }): JSX.Element {
  const empty = name === '—';
  return (
    <div style={{ display: 'flex', gap: 10 }}>
      <span
        className="mono"
        style={{
          color: 'rgba(255,255,255,.55)',
          fontSize: 11,
          width: 22,
          flexShrink: 0,
          paddingTop: 1,
        }}
      >
        {base}
      </span>
      <span
        style={{
          color: empty ? 'rgba(255,255,255,.4)' : 'white',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          minWidth: 0,
        }}
      >
        {name}
      </span>
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
