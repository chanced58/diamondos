'use client';

import { useEffect, useState, type JSX } from 'react';
import type { PersistedPracticeSummary } from '@baseball/shared';
import {
  generatePracticeSummaryAction,
  loadPracticeSummaryAction,
} from './actions';

interface PlayerLookup {
  firstName: string;
  lastName: string;
  jerseyNumber?: number | null;
}

interface Props {
  practiceId: string;
  players: Record<string, PlayerLookup>;
}

export function SummarySection({ practiceId, players }: Props): JSX.Element {
  const [summary, setSummary] = useState<PersistedPracticeSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadPracticeSummaryAction(practiceId)
      .then((result) => {
        if (cancelled) return;
        if (typeof result === 'string') setError(result);
        else setSummary(result);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(
          `Failed to load summary: ${err instanceof Error ? err.message : String(err)}`,
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [practiceId]);

  async function runGenerate() {
    if (generating) return;
    setError(null);
    setGenerating(true);
    try {
      const result = await generatePracticeSummaryAction(practiceId);
      if (typeof result === 'string') {
        setError(result);
        return;
      }
      setSummary(result);
    } catch (err) {
      setError(
        `Summary generation failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setGenerating(false);
    }
  }

  function formatPlayerName(id: string): string {
    const p = players[id];
    if (!p) return '(unknown player)';
    const jersey = p.jerseyNumber != null ? ` #${p.jerseyNumber}` : '';
    return `${p.firstName} ${p.lastName}${jersey}`;
  }

  return (
    <section className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-base font-semibold text-gray-900">AI summary</h2>
        <button
          type="button"
          onClick={runGenerate}
          disabled={generating || loading}
          className="text-sm bg-brand-700 text-white px-3 py-1.5 rounded-md hover:bg-brand-800 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {generating
            ? 'Generating…'
            : summary
              ? 'Regenerate'
              : 'Generate summary'}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-lg px-4 py-3 mb-3">
          {error}
        </div>
      )}

      {loading && !summary && (
        <p className="text-sm text-gray-400 italic">Checking for a saved summary…</p>
      )}

      {!loading && !summary && !error && (
        <p className="text-sm text-gray-500">
          No summary yet. Click <strong>Generate summary</strong> to have
          Claude draft a recap of this practice from the blocks, reps, and
          notes.
        </p>
      )}

      {summary && (
        <div className="space-y-5">
          <div className="text-xs text-gray-400">
            Generated {new Date(summary.generatedAt).toLocaleString()} ·{' '}
            {summary.model}
          </div>

          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-1">Recap</h3>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">
              {summary.coachRecap}
            </p>
          </div>

          {summary.standoutPlayers.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-2">
                Standouts
              </h3>
              <ul className="space-y-1.5">
                {summary.standoutPlayers.map((s) => (
                  <li key={s.playerId} className="text-sm text-gray-700">
                    <span className="font-medium text-gray-900">
                      {formatPlayerName(s.playerId)}
                    </span>{' '}
                    — {s.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {summary.concerns.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-2">
                Concerns
              </h3>
              <ul className="space-y-1.5">
                {summary.concerns.map((c, i) => (
                  <li key={i} className="text-sm text-gray-700">
                    {c.playerId && (
                      <>
                        <span className="font-medium text-gray-900">
                          {formatPlayerName(c.playerId)}
                        </span>{' '}
                      </>
                    )}
                    — {c.note}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {Object.keys(summary.playerSummaries).length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-2">
                Per-player
              </h3>
              <div className="space-y-3">
                {Object.entries(summary.playerSummaries).map(([pid, text]) => (
                  <div
                    key={pid}
                    className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2"
                  >
                    <div className="text-xs font-medium text-gray-900 mb-0.5">
                      {formatPlayerName(pid)}
                    </div>
                    <div className="text-sm text-gray-700">{text}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
