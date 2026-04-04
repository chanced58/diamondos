'use client';

import React, { useState, useCallback } from 'react';
import type {
  GameHistoryTree as GameHistoryTreeType,
  InningNode,
  HalfInningNode,
  AtBatNode,
  InterstitialNode,
  PitchNode,
  HistoryEventNode,
  EventCategory,
} from '@baseball/shared';
import { voidEventAction } from '@/app/(app)/games/[gameId]/actions';

// ── Category Colors ─────────────────────────────────────────────────────────

const CATEGORY_PILL: Record<EventCategory, string> = {
  positive: 'bg-green-50 text-green-700 border border-green-200',
  negative: 'bg-red-50 text-red-700 border border-red-200',
  neutral: 'bg-gray-100 text-gray-600 border border-gray-200',
  info: 'bg-blue-50 text-blue-700 border border-blue-200',
};

const CATEGORY_TEXT: Record<EventCategory, string> = {
  positive: 'text-green-700',
  negative: 'text-red-700',
  neutral: 'text-gray-600',
  info: 'text-blue-600',
};

// ── Chevron Icon ────────────────────────────────────────────────────────────

function Chevron({ expanded }: { expanded: boolean }) {
  return (
    <svg
      className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}

// ── Void Button ────────────────────────────────────────────────────────────

function VoidButton({ eventId, gameId }: { eventId: string; gameId: string }) {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleVoid() {
    if (!confirm('Void this event? You can recalculate scores after.')) return;
    setIsPending(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.set('gameId', gameId);
      formData.set('eventId', eventId);
      const err = await voidEventAction(null, formData);
      if (err) setError(err);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to void event.');
    } finally {
      setIsPending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleVoid}
        disabled={isPending}
        className="shrink-0 p-0.5 text-gray-300 hover:text-red-500 disabled:opacity-50 transition-colors"
        aria-label="Void event"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
        </svg>
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </>
  );
}

// ── Interstitial Event Row ──────────────────────────────────────────────────

function InterstitialRow({ node, isCoach, gameId }: { node: InterstitialNode; isCoach?: boolean; gameId?: string }) {
  return (
    <div className="flex items-center gap-2 py-1.5 px-3 text-sm italic">
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
        node.category === 'info' ? 'bg-blue-400' : node.category === 'positive' ? 'bg-green-400' : node.category === 'negative' ? 'bg-red-400' : 'bg-gray-400'
      }`} />
      <span className={CATEGORY_TEXT[node.category]}>{node.label}</span>
      {isCoach && gameId && (
        <VoidButton eventId={node.event.id} gameId={gameId} />
      )}
    </div>
  );
}

// ── Mid-At-Bat Event Row ────────────────────────────────────────────────────

function MidAtBatRow({ node, isCoach, gameId }: { node: HistoryEventNode; isCoach?: boolean; gameId?: string }) {
  return (
    <div className="flex items-center gap-2 py-1 text-xs italic">
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
        node.category === 'positive' ? 'bg-green-400' : node.category === 'negative' ? 'bg-red-400' : node.category === 'info' ? 'bg-blue-400' : 'bg-gray-400'
      }`} />
      <span className={CATEGORY_TEXT[node.category]}>{node.label}</span>
      {isCoach && gameId && (
        <VoidButton eventId={node.event.id} gameId={gameId} />
      )}
    </div>
  );
}

// ── Pitch Row ───────────────────────────────────────────────────────────────

function PitchRow({ pitch, isCoach, gameId }: { pitch: PitchNode; isCoach?: boolean; gameId?: string }) {
  return (
    <div className="flex items-center gap-2 py-1 text-sm text-gray-700">
      <span className="w-1.5 h-1.5 rounded-full bg-gray-300 shrink-0" />
      <span>{pitch.label}</span>
      {isCoach && gameId && (
        <VoidButton eventId={pitch.event.id} gameId={gameId} />
      )}
    </div>
  );
}

// ── At-Bat Section ──────────────────────────────────────────────────────────

function AtBatSection({
  atBat,
  nodeKey,
  expanded,
  onToggle,
  isHome,
  isCoach,
  gameId,
}: {
  atBat: AtBatNode;
  nodeKey: string;
  expanded: boolean;
  onToggle: (key: string) => void;
  isHome: boolean;
  isCoach?: boolean;
  gameId?: string;
}) {
  // Interleave pitches and mid-at-bat events by sequence number
  const pitchItems = atBat.pitches.map((p) => ({ type: 'pitch' as const, data: p, seq: p.event.sequenceNumber }));
  const midItems = atBat.midAtBatEvents.map((m) => ({ type: 'mid' as const, data: m, seq: m.event.sequenceNumber }));
  const merged = [...pitchItems, ...midItems].sort((a, b) => a.seq - b.seq);

  return (
    <div className="py-1">
      <button
        onClick={() => onToggle(nodeKey)}
        className="w-full flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-gray-50 transition-colors text-left"
      >
        <Chevron expanded={expanded} />
        <span className="text-sm font-medium text-gray-800">
          #{atBat.number}: {atBat.batterName}
          <span className="font-normal text-gray-500"> vs </span>
          {atBat.pitcherName}
        </span>
        {atBat.pitches.length > 0 && (
          <span className="text-xs text-gray-400 ml-1">
            ({atBat.pitches.length} {atBat.pitches.length === 1 ? 'pitch' : 'pitches'})
          </span>
        )}
        <span className="ml-auto" />
        {atBat.result && (
          <>
            <ScoreBadge homeScore={atBat.homeScore} awayScore={atBat.awayScore} isHome={isHome} />
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${CATEGORY_PILL[atBat.result.category]}`}>
              {atBat.result.label}
            </span>
          </>
        )}
        {!atBat.result && (
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
            In Progress
          </span>
        )}
      </button>

      {expanded && (
        <div className="ml-6 pl-4 border-l-2 border-gray-200 mt-1 mb-2">
          {merged.map((item, i) =>
            item.type === 'pitch'
              ? <PitchRow key={i} pitch={item.data as PitchNode} isCoach={isCoach} gameId={gameId} />
              : <MidAtBatRow key={i} node={item.data as HistoryEventNode} isCoach={isCoach} gameId={gameId} />
          )}
          {atBat.result && (
            <div className="flex items-center gap-2 py-1.5 text-sm font-medium">
              <span className={`w-2 h-2 rounded-full shrink-0 ${
                atBat.result.category === 'positive' ? 'bg-green-500' : atBat.result.category === 'negative' ? 'bg-red-500' : 'bg-gray-400'
              }`} />
              <span className={CATEGORY_TEXT[atBat.result.category]}>
                Result: {atBat.result.label}
              </span>
              {isCoach && gameId && (
                <VoidButton eventId={atBat.result.event.id} gameId={gameId} />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Half-Inning Section ─────────────────────────────────────────────────────

function HalfInningSection({
  half,
  teamLabel,
  nodeKey,
  expanded,
  expandedNodes,
  onToggle,
  isHome,
  isCoach,
  gameId,
}: {
  half: HalfInningNode;
  teamLabel: string;
  nodeKey: string;
  expanded: boolean;
  expandedNodes: Set<string>;
  onToggle: (key: string) => void;
  isHome: boolean;
  isCoach?: boolean;
  gameId?: string;
}) {
  return (
    <div className="py-1">
      <button
        onClick={() => onToggle(nodeKey)}
        className="w-full flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-gray-50 transition-colors text-left"
      >
        <Chevron expanded={expanded} />
        <span className="text-sm font-semibold text-gray-700">
          {half.label}
        </span>
        <span className="text-xs text-gray-400">— {teamLabel}</span>
        <span className="ml-auto" />
        <ScoreBadge homeScore={half.homeScore} awayScore={half.awayScore} isHome={isHome} />
      </button>

      {expanded && (
        <div className="ml-4 mt-1">
          {half.items.map((item, i) => {
            if (item.type === 'at-bat') {
              const abKey = `${nodeKey}-ab-${item.number}`;
              return (
                <AtBatSection
                  key={i}
                  atBat={item}
                  nodeKey={abKey}
                  expanded={expandedNodes.has(abKey)}
                  onToggle={onToggle}
                  isHome={isHome}
                  isCoach={isCoach}
                  gameId={gameId}
                />
              );
            }
            return <InterstitialRow key={i} node={item} isCoach={isCoach} gameId={gameId} />;
          })}
        </div>
      )}
    </div>
  );
}

// ── Inning Section ──────────────────────────────────────────────────────────

function InningSection({
  inning,
  nodeKey,
  expanded,
  expandedNodes,
  onToggle,
  homeTeamName,
  awayTeamName,
  isHome,
  isCoach,
  gameId,
}: {
  inning: InningNode;
  nodeKey: string;
  expanded: boolean;
  expandedNodes: Set<string>;
  onToggle: (key: string) => void;
  homeTeamName: string;
  awayTeamName: string;
  isHome: boolean;
  isCoach?: boolean;
  gameId?: string;
}) {
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button
        onClick={() => onToggle(nodeKey)}
        className="w-full flex items-center gap-2 px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
      >
        <Chevron expanded={expanded} />
        <span className="text-sm font-bold text-gray-800">
          Inning {inning.number}
        </span>
        <span className="ml-auto" />
        <ScoreBadge homeScore={inning.homeScore} awayScore={inning.awayScore} isHome={isHome} />
      </button>

      {expanded && (
        <div className="px-4 pb-3">
          {inning.top && (
            <HalfInningSection
              half={inning.top}
              teamLabel={awayTeamName}
              nodeKey={`${nodeKey}-top`}
              expanded={expandedNodes.has(`${nodeKey}-top`)}
              expandedNodes={expandedNodes}
              onToggle={onToggle}
              isHome={isHome}
              isCoach={isCoach}
              gameId={gameId}
            />
          )}
          {inning.bottom && (
            <HalfInningSection
              half={inning.bottom}
              teamLabel={homeTeamName}
              nodeKey={`${nodeKey}-bot`}
              expanded={expandedNodes.has(`${nodeKey}-bot`)}
              expandedNodes={expandedNodes}
              onToggle={onToggle}
              isHome={isHome}
              isCoach={isCoach}
              gameId={gameId}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

function ScoreBadge({ homeScore, awayScore, isHome }: { homeScore: number; awayScore: number; isHome: boolean }) {
  const usScore = isHome ? homeScore : awayScore;
  const themScore = isHome ? awayScore : homeScore;
  return (
    <span className="text-xs font-semibold text-gray-500 tabular-nums">
      {usScore}–{themScore}
    </span>
  );
}

interface GameHistoryTreeProps {
  tree: GameHistoryTreeType;
  teamName: string;
  opponentName: string;
  isHome: boolean;
  isCoach?: boolean;
  gameId?: string;
}

export function GameHistoryTree({ tree, teamName, opponentName, isHome, isCoach, gameId }: GameHistoryTreeProps): React.JSX.Element {
  const homeTeamName = isHome ? teamName : opponentName;
  const awayTeamName = isHome ? opponentName : teamName;

  // Build default expanded set: all innings + half-innings, no at-bats
  const buildDefaultExpanded = useCallback(() => {
    const set = new Set<string>();
    for (const inning of tree.innings) {
      const innKey = `inn-${inning.number}`;
      set.add(innKey);
      if (inning.top) set.add(`${innKey}-top`);
      if (inning.bottom) set.add(`${innKey}-bot`);
    }
    return set;
  }, [tree]);

  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(buildDefaultExpanded);

  const onToggle = useCallback((key: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    const set = new Set<string>();
    for (const inning of tree.innings) {
      const innKey = `inn-${inning.number}`;
      set.add(innKey);
      if (inning.top) {
        set.add(`${innKey}-top`);
        for (const item of inning.top.items) {
          if (item.type === 'at-bat') set.add(`${innKey}-top-ab-${item.number}`);
        }
      }
      if (inning.bottom) {
        set.add(`${innKey}-bot`);
        for (const item of inning.bottom.items) {
          if (item.type === 'at-bat') set.add(`${innKey}-bot-ab-${item.number}`);
        }
      }
    }
    setExpandedNodes(set);
  }, [tree]);

  const collapseAll = useCallback(() => {
    setExpandedNodes(new Set<string>());
  }, []);

  if (tree.innings.length === 0) {
    return (
      <p className="text-gray-500 text-sm">No events recorded yet.</p>
    );
  }

  return (
    <div className="space-y-3">
      {/* Controls */}
      <div className="flex items-center gap-2">
        <button
          onClick={expandAll}
          className="text-xs text-brand-700 hover:underline font-medium"
        >
          Expand All
        </button>
        <span className="text-gray-300">|</span>
        <button
          onClick={collapseAll}
          className="text-xs text-brand-700 hover:underline font-medium"
        >
          Collapse All
        </button>
      </div>

      {/* Innings */}
      {tree.innings.map((inning) => {
        const innKey = `inn-${inning.number}`;
        return (
          <InningSection
            key={inning.number}
            inning={inning}
            nodeKey={innKey}
            expanded={expandedNodes.has(innKey)}
            expandedNodes={expandedNodes}
            onToggle={onToggle}
            homeTeamName={homeTeamName}
            awayTeamName={awayTeamName}
            isHome={isHome}
            isCoach={isCoach}
            gameId={gameId}
          />
        );
      })}
    </div>
  );
}
