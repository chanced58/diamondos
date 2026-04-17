'use client';
import type { JSX } from 'react';

import Link from 'next/link';
import { POSITION_ABBREVIATIONS, formatDate } from '@baseball/shared';
import { ReactivateForm } from './ReactivateForm';

type DisabledPlayer = {
  id: string;
  firstName: string;
  lastName: string;
  primaryPosition: string | null;
  disabledAt: string | null;
};

type Props = {
  teamId: string;
  players: DisabledPlayer[];
  isCoach: boolean;
};

export function DisabledPlayersSection({ teamId, players, isCoach }: Props): JSX.Element | null {
  if (players.length === 0) return null;

  return (
    <section>
      <details className="group">
        <summary className="flex items-center gap-2 cursor-pointer select-none mb-3">
          <h2 className="text-base font-semibold text-gray-500">Disabled Players</h2>
          <span className="text-xs bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full font-medium">
            {players.length}
          </span>
          <span className="text-xs text-gray-400 group-open:hidden ml-1">Show</span>
          <span className="text-xs text-gray-400 hidden group-open:inline ml-1">Hide</span>
        </summary>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Name</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Pos</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Disabled</th>
                {isCoach && (
                  <th className="text-right px-4 py-3 text-gray-500 font-medium">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {players.map((player) => (
                <tr key={player.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-500">
                    <Link
                      href={`/teams/${teamId}/roster/${player.id}`}
                      className="hover:text-brand-700 transition-colors"
                    >
                      {player.lastName}, {player.firstName}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-400">
                    {player.primaryPosition
                      ? POSITION_ABBREVIATIONS[player.primaryPosition]
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">
                    {player.disabledAt
                      ? formatDate(player.disabledAt)
                      : '—'}
                  </td>
                  {isCoach && (
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <Link
                          href={`/teams/${teamId}/roster/${player.id}`}
                          className="text-xs text-gray-500 hover:text-gray-700 transition-colors"
                        >
                          View
                        </Link>
                        <span className="text-gray-200">|</span>
                        <ReactivateForm
                          playerId={player.id}
                          teamId={teamId}
                        />
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
