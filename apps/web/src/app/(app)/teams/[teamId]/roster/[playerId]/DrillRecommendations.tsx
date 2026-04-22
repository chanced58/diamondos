'use client';

import { useState, type JSX } from 'react';
import Link from 'next/link';
import {
  rankDrillsForPlayerAction,
  type RankDrillsSuccess,
} from './drill-recommendations-actions';

interface Props {
  teamId: string;
  playerId: string;
}

const IMPACT_COLORS: Record<'high' | 'medium' | 'low', string> = {
  high: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  medium: 'bg-amber-50 text-amber-800 border-amber-200',
  low: 'bg-gray-50 text-gray-600 border-gray-200',
};

export function DrillRecommendations({ teamId, playerId }: Props): JSX.Element {
  const [result, setResult] = useState<RankDrillsSuccess | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runRank() {
    if (loading) return;
    setError(null);
    setLoading(true);
    try {
      const res = await rankDrillsForPlayerAction(teamId, playerId);
      if (typeof res === 'string') {
        setError(res);
        return;
      }
      setResult(res);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-semibold text-gray-900">
          Recommended drills
        </h2>
        <button
          type="button"
          onClick={runRank}
          disabled={loading}
          className="text-sm bg-brand-700 text-white px-3 py-1.5 rounded-md hover:bg-brand-800 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading
            ? 'Ranking…'
            : result
              ? 'Re-rank'
              : 'Suggest drills'}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-lg px-4 py-3 mb-3">
          {error}
        </div>
      )}

      {!result && !loading && !error && (
        <p className="text-sm text-gray-500">
          Let Claude analyze this player&apos;s recent reps and stats, then rank up
          to 10 drills from your library by expected development impact.
        </p>
      )}

      {result && (
        <div className="space-y-3">
          <p className="text-sm text-gray-700 italic">{result.recommendations.summary}</p>
          <ol className="space-y-2">
            {result.recommendations.rankedDrills.map((rec, idx) => {
              const drill = result.drillsById[rec.drillId];
              if (!drill) return null;
              return (
                <li
                  key={rec.drillId}
                  className="bg-white border border-gray-200 rounded-lg p-3"
                >
                  <div className="flex items-baseline justify-between gap-3 flex-wrap">
                    <div className="flex items-baseline gap-2">
                      <span className="text-xs font-mono text-gray-400 w-5">
                        {idx + 1}.
                      </span>
                      <Link
                        href={`/practices/drills/${rec.drillId}`}
                        className="text-sm font-medium text-gray-900 hover:text-brand-700 hover:underline"
                      >
                        {drill.name}
                      </Link>
                      {drill.durationMinutes && (
                        <span className="text-xs text-gray-400">
                          {drill.durationMinutes}m
                        </span>
                      )}
                    </div>
                    <span
                      className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full border ${IMPACT_COLORS[rec.expectedImpact]}`}
                    >
                      {rec.expectedImpact} impact
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 mt-1 ml-7">
                    {rec.rationale}
                  </p>
                  {rec.addressesDeficits.length > 0 && (
                    <div className="mt-1 ml-7 flex flex-wrap gap-1">
                      {rec.addressesDeficits.map((d, i) => (
                        <span
                          key={i}
                          className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded"
                        >
                          {d}
                        </span>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
          {result.unknownDrillIds.length > 0 && (
            <p className="text-xs text-gray-400 italic">
              {result.unknownDrillIds.length} ranked drill(s) were omitted
              because they didn&apos;t match the current library.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
