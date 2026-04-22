'use client';

import { useState, type JSX } from 'react';
import type {
  AiHitterProfile,
  AiPitcherTendency,
  PersistedScoutingCard,
  ScoutingHitterStats,
  ScoutingPitcherStats,
} from '@baseball/shared';
import { generateScoutingCardAction } from './actions';

interface Props {
  opponentTeamId: string;
  opponentName: string;
  priorGames: number;
  initialCard: PersistedScoutingCard | null;
}

export function ScoutingCardClient({
  opponentTeamId,
  opponentName,
  priorGames,
  initialCard,
}: Props): JSX.Element {
  const [card, setCard] = useState<PersistedScoutingCard | null>(initialCard);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runGenerate() {
    if (generating) return;
    setError(null);
    setGenerating(true);
    try {
      const result = await generateScoutingCardAction(opponentTeamId);
      if (typeof result === 'string') {
        setError(result);
        return;
      }
      setCard(result);
    } finally {
      setGenerating(false);
    }
  }

  if (priorGames === 0) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-amber-900 mb-1">
          No prior games on record
        </h2>
        <p className="text-sm text-amber-900/90">
          The scouting card draws from your past games against{' '}
          <strong>{opponentName}</strong>. Once you&apos;ve played them at
          least once, come back to generate the card.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={runGenerate}
          disabled={generating}
          className="bg-brand-700 text-white font-semibold px-4 py-2 rounded-lg hover:bg-brand-800 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
        >
          {generating
            ? 'Generating…'
            : card
              ? 'Regenerate card'
              : 'Generate card'}
        </button>
        {card && (
          <span className="text-xs text-gray-500">
            Last generated {new Date(card.generatedAt).toLocaleString()} ·{' '}
            {card.model}
          </span>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      {card && <RenderCard card={card} />}
    </div>
  );
}

function RenderCard({ card }: { card: PersistedScoutingCard }): JSX.Element {
  const hitterStatById = Object.fromEntries(
    card.hitterStats.map((h) => [h.opponentPlayerId, h]),
  );

  return (
    <div className="space-y-5">
      <div className="bg-brand-50 border border-brand-200 rounded-xl p-4">
        <div className="text-xs uppercase tracking-wide text-brand-900/70 mb-1">
          Dugout takeaway
        </div>
        <p className="text-sm font-medium text-brand-900">
          {card.aiCard.oneLineSummary}
        </p>
      </div>

      {card.aiCard.teamTendencies.bullets.length > 0 && (
        <section className="bg-white border border-gray-200 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-2">
            Team tendencies
          </h2>
          <ul className="list-disc pl-5 space-y-1 text-sm text-gray-700">
            {card.aiCard.teamTendencies.bullets.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        </section>
      )}

      {card.aiCard.pitcherTendencies.length > 0 && (
        <section className="bg-white border border-gray-200 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Pitchers</h2>
          <div className="space-y-4">
            {card.aiCard.pitcherTendencies.map((p, i) => (
              <PitcherBlock
                key={p.opponentPlayerId ?? `noid-${i}`}
                ai={p}
                stats={findPitcherStats(card.pitcherStats, p)}
              />
            ))}
          </div>
        </section>
      )}

      {card.aiCard.hitterProfiles.length > 0 && (
        <section className="bg-white border border-gray-200 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Hitters</h2>
          <div className="space-y-4">
            {card.aiCard.hitterProfiles.map((h) => (
              <HitterBlock
                key={h.opponentPlayerId}
                ai={h}
                stats={hitterStatById[h.opponentPlayerId]}
              />
            ))}
          </div>
        </section>
      )}

      {card.aiCard.keyMatchups.length > 0 && (
        <section className="bg-white border border-gray-200 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-2">
            Key matchups
          </h2>
          <div className="space-y-3">
            {card.aiCard.keyMatchups.map((m, i) => (
              <div key={i} className="text-sm">
                <div className="font-medium text-gray-900">
                  {m.ourLabel} <span className="text-gray-400">vs</span>{' '}
                  {m.theirLabel}
                </div>
                <div className="text-gray-700">{m.note}</div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function findPitcherStats(
  all: ScoutingPitcherStats[],
  ai: AiPitcherTendency,
): ScoutingPitcherStats | undefined {
  if (ai.opponentPlayerId) {
    return all.find((p) => p.opponentPlayerId === ai.opponentPlayerId);
  }
  return all.find(
    (p) => p.displayName.toLowerCase() === ai.displayName.toLowerCase(),
  );
}

function PitcherBlock({
  ai,
  stats,
}: {
  ai: AiPitcherTendency;
  stats?: ScoutingPitcherStats;
}): JSX.Element {
  return (
    <div className="border-l-4 border-gray-200 pl-4">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <div className="text-sm font-medium text-gray-900">
          {ai.displayName}
        </div>
        {stats && (
          <div className="text-xs text-gray-500 font-mono tabular-nums">
            {stats.pitches} pitches
            {stats.avgVelocity != null &&
              ` · avg ${stats.avgVelocity.toFixed(1)} mph`}
            {stats.firstPitchStrikePct != null &&
              ` · 1st-pitch strike ${(stats.firstPitchStrikePct * 100).toFixed(0)}%`}
          </div>
        )}
      </div>
      {stats && stats.pitchMix.length > 0 && (
        <div className="text-xs text-gray-500 mt-0.5">
          Mix:{' '}
          {stats.pitchMix
            .slice(0, 4)
            .map((m) => `${m.pitchType} ${m.percent.toFixed(0)}%`)
            .join(' · ')}
        </div>
      )}
      <p className="text-sm text-gray-700 mt-1">
        <span className="font-medium">Approach.</span> {ai.approach}
      </p>
      <p className="text-sm text-gray-700 mt-1">
        <span className="font-medium">How to attack.</span> {ai.howToAttack}
      </p>
    </div>
  );
}

function HitterBlock({
  ai,
  stats,
}: {
  ai: AiHitterProfile;
  stats?: ScoutingHitterStats;
}): JSX.Element {
  return (
    <div className="border-l-4 border-gray-200 pl-4">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <div className="text-sm font-medium text-gray-900">
          {stats ? `${stats.displayName}` : '(player)'}{' '}
          {stats?.position && (
            <span className="text-xs text-gray-400">· {stats.position}</span>
          )}
          {stats?.bats && (
            <span className="text-xs text-gray-400"> · bats {stats.bats}</span>
          )}
        </div>
        {stats && (
          <div className="text-xs text-gray-500 font-mono tabular-nums">
            {stats.avg}/{stats.obp}/{stats.slg} · OPS {stats.ops} · PA {stats.pa}
          </div>
        )}
      </div>
      <p className="text-sm text-gray-700 mt-1">
        <span className="font-medium">Approach.</span> {ai.approach}
      </p>
      <p className="text-sm text-gray-700 mt-1">
        <span className="font-medium">How to pitch him.</span> {ai.howToPitchThem}
      </p>
      <div className="flex flex-wrap gap-4 mt-2">
        <ZoneGrid label="Hot zones" cells={ai.hotZones} tone="hot" />
        <ZoneGrid label="Cold zones" cells={ai.coldZones} tone="cold" />
      </div>
      <div className="text-xs text-gray-500 mt-2 flex gap-4">
        <span>Steal risk: {ai.stealRisk}</span>
        <span>Bunt risk: {ai.buntRisk}</span>
      </div>
    </div>
  );
}

function ZoneGrid({
  label,
  cells,
  tone,
}: {
  label: string;
  cells: number[];
  tone: 'hot' | 'cold';
}): JSX.Element {
  const active = new Set(cells);
  const bg = tone === 'hot' ? 'bg-red-400' : 'bg-blue-400';
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">
        {label}
      </div>
      <div
        className="grid grid-cols-3 gap-0.5 border border-gray-300"
        style={{ width: 60, height: 60 }}
      >
        {Array.from({ length: 9 }, (_, i) => i + 1).map((n) => (
          <div
            key={n}
            className={`${active.has(n) ? bg : 'bg-gray-100'}`}
            title={`Zone ${n}`}
          />
        ))}
      </div>
    </div>
  );
}
