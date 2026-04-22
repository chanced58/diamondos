'use client';
import type { JSX } from 'react';

export type VolumeRow = {
  slug: string;
  name: string;
  description: string | null;
  visibility: 'system' | 'team';
  planned: number;
  actual: number;
  sessions: number;
  lastWorkedAt: string | null;
};

function formatMinutes(mins: number): string {
  if (mins === 0) return '0';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function VolumeByFocusChart({ rows }: { rows: VolumeRow[] }): JSX.Element {
  const sorted = [...rows].sort((a, b) => b.planned - a.planned || a.name.localeCompare(b.name));
  const maxPlanned = Math.max(1, ...sorted.map((r) => r.planned));

  const worked = sorted.filter((r) => r.planned > 0);
  const blindSpots = sorted.filter((r) => r.planned === 0);

  return (
    <div className="space-y-6">
      <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <header className="px-5 py-3 border-b border-gray-200 bg-gray-50">
          <h2 className="text-sm font-semibold text-gray-900">
            Time worked ({worked.length} focus{worked.length === 1 ? '' : 'es'})
          </h2>
        </header>
        {worked.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <p className="text-sm text-gray-500">
              No tagged drills have been worked in this window yet.
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Tag drills with a focus in the drill library, then schedule a practice that uses them.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {worked.map((r) => {
              const pct = Math.max(3, (r.planned / maxPlanned) * 100);
              return (
                <li key={r.slug} className="px-5 py-3">
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="text-sm font-medium text-gray-900">
                      {r.name}
                      {r.visibility === 'team' && (
                        <span className="ml-1 text-xs font-normal text-gray-400">(team)</span>
                      )}
                    </span>
                    <span className="text-xs text-gray-500 tabular-nums">
                      {formatMinutes(r.planned)} planned · {r.sessions} session{r.sessions === 1 ? '' : 's'}
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 bg-gray-100 rounded overflow-hidden">
                    <div
                      className="h-full bg-blue-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  {r.actual > 0 && r.actual !== r.planned && (
                    <div className="mt-1 text-xs text-gray-500">
                      Actual: {formatMinutes(r.actual)}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {blindSpots.length > 0 && (
        <section className="bg-white border border-amber-200 rounded-xl overflow-hidden">
          <header className="px-5 py-3 border-b border-amber-200 bg-amber-50">
            <h2 className="text-sm font-semibold text-amber-900">
              Not yet worked ({blindSpots.length}) — blind spots
            </h2>
            <p className="text-xs text-amber-800 mt-0.5">
              System-seeded focuses with zero minutes in this window.
            </p>
          </header>
          <ul className="divide-y divide-amber-100">
            {blindSpots.map((r) => (
              <li key={r.slug} className="px-5 py-2.5">
                <span className="text-sm font-medium text-gray-900">{r.name}</span>
                {r.description && (
                  <span className="ml-2 text-xs text-gray-500">{r.description}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
