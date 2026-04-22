'use client';
import type { JSX } from 'react';

export type CatcherRow = {
  playerId: string;
  playerName: string;
  totalInnings: number;
  games: number;
  lastGameDate: string | null;
};

function formatInnings(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(n % 1 === 0 ? 0 : 2);
}

export function CatcherInningsTable({ rows }: { rows: CatcherRow[] }): JSX.Element {
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="text-left font-medium text-gray-700 px-4 py-2.5">Catcher</th>
            <th className="text-right font-medium text-gray-700 px-4 py-2.5" title="Total defensive half-innings caught">
              Innings
            </th>
            <th className="text-right font-medium text-gray-700 px-4 py-2.5">Games</th>
            <th className="text-right font-medium text-gray-700 px-4 py-2.5">Avg/Game</th>
            <th className="text-right font-medium text-gray-700 px-4 py-2.5">Last game</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.playerId} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
              <td className="px-4 py-2.5 font-medium text-gray-900">{r.playerName}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{formatInnings(r.totalInnings)}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{r.games}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">
                {r.games > 0 ? formatInnings(r.totalInnings / r.games) : '—'}
              </td>
              <td className="px-4 py-2.5 text-right text-gray-600 tabular-nums">{r.lastGameDate ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
