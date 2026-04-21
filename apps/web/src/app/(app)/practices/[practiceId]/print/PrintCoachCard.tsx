'use client';

import { useEffect, type JSX } from 'react';
import type { CoachCardRow } from '@baseball/shared';
import {
  FIELD_SPACE_LABELS,
  PracticeFieldSpace,
  WEATHER_MODE_LABELS,
  type PracticeWeatherMode,
} from '@baseball/shared';

interface Props {
  practiceDate: string;
  weatherMode: PracticeWeatherMode;
  totalMinutes: number;
  rows: CoachCardRow[];
}

export function PrintCoachCard({
  practiceDate,
  weatherMode,
  totalMinutes,
  rows,
}: Props): JSX.Element {
  useEffect(() => {
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, []);

  const date = new Date(practiceDate);

  return (
    <>
      <style jsx global>{`
        @media print {
          @page {
            size: letter;
            margin: 0.4in;
          }
          body {
            background: white !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>
      <div className="max-w-[8.5in] mx-auto p-6 bg-white text-black">
        <div className="no-print mb-4 flex items-center justify-between">
          <p className="text-sm text-gray-500">Use your browser&apos;s print dialog (or save as PDF).</p>
          <button
            type="button"
            onClick={() => window.print()}
            className="bg-brand-700 text-white text-sm font-semibold px-3 py-1.5 rounded-lg"
          >
            Print
          </button>
        </div>

        <header className="border-b-2 border-black pb-3 mb-4">
          <div className="flex items-end justify-between">
            <div>
              <h1 className="text-2xl font-bold">Practice Plan</h1>
              <p className="text-sm">
                {date.toLocaleDateString(undefined, {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })}{' '}
                at{' '}
                {date.toLocaleTimeString(undefined, {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </div>
            <div className="text-right text-sm">
              <p>{WEATHER_MODE_LABELS[weatherMode]}</p>
              <p className="font-semibold">Total: {totalMinutes} min</p>
            </div>
          </div>
        </header>

        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b-2 border-black text-left">
              <th className="py-1 pr-2 w-16">Time</th>
              <th className="py-1 pr-2 w-12">Min</th>
              <th className="py-1 pr-2 w-28">Type</th>
              <th className="py-1 pr-2">Block</th>
              <th className="py-1 pr-2">Drill</th>
              <th className="py-1 pr-2">Field</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.blockId} className="border-b border-gray-300 align-top">
                <td className="py-1 pr-2 font-mono text-xs">
                  {r.startsAt && new Date(r.startsAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </td>
                <td className="py-1 pr-2 font-mono text-xs">{r.plannedDurationMinutes}</td>
                <td className="py-1 pr-2 text-xs">{r.blockTypeLabel}</td>
                <td className="py-1 pr-2 font-semibold">
                  {r.title}
                  {r.notes && <div className="text-[11px] font-normal text-gray-700">{r.notes}</div>}
                  {r.stations.length > 0 && (
                    <div className="mt-1 text-[11px] font-normal text-gray-700">
                      {r.stations.map((s, i) => (
                        <div key={`${s.name}-${i}`}>
                          · <strong>{s.name}</strong>
                          {s.drillName ? `: ${s.drillName}` : ''}
                          {s.fieldSpace ? ` — ${s.fieldSpace}` : ''}
                        </div>
                      ))}
                    </div>
                  )}
                </td>
                <td className="py-1 pr-2 text-xs">{r.drillName ?? '—'}</td>
                <td className="py-1 pr-2 text-xs">
                  {r.fieldSpaces
                    .map((fs) => FIELD_SPACE_LABELS[fs as PracticeFieldSpace] ?? fs)
                    .join(', ') || '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {rows.some((r) => r.players.length > 0) && (
          <section className="mt-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide border-b border-black pb-1 mb-1">
              Assignments
            </h2>
            <div className="grid grid-cols-2 gap-x-6 text-xs">
              {rows
                .filter((r) => r.players.length > 0)
                .map((r) => (
                  <div key={r.blockId} className="mb-1">
                    <p className="font-semibold">{r.title}</p>
                    <p className="text-[11px]">
                      {r.players
                        .map(
                          (p) =>
                            `${p.jerseyNumber !== undefined ? `#${p.jerseyNumber} ` : ''}${p.name}`,
                        )
                        .join(', ')}
                    </p>
                  </div>
                ))}
            </div>
          </section>
        )}
      </div>
    </>
  );
}
