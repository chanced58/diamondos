'use client';
import type { JSX } from 'react';

import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import Link from 'next/link';
import { reactivatePlayerAction } from './actions';
import { POSITION_ABBREVIATIONS } from '@baseball/shared';

type DisabledPlayer = {
  id: string;
  firstName: string;
  lastName: string;
  primaryPosition: string | null;
  disabledAt: string | null;
};

function ReactivateButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="text-xs font-medium text-brand-700 hover:text-brand-800 disabled:opacity-50 transition-colors"
    >
      {pending ? 'Reactivating...' : 'Reactivate'}
    </button>
  );
}

function ReactivateForm({ player, teamId }: { player: DisabledPlayer; teamId: string }) {
  const [error, formAction] = useFormState(reactivatePlayerAction, null);
  const [jerseyNumber, setJerseyNumber] = useState('');
  const [showForm, setShowForm] = useState(false);

  if (!showForm) {
    return (
      <button
        onClick={() => setShowForm(true)}
        className="text-xs font-medium text-brand-700 hover:text-brand-800 transition-colors"
      >
        Reactivate
      </button>
    );
  }

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="teamId" value={teamId} />
      <input type="hidden" name="playerId" value={player.id} />
      <input
        type="number"
        name="jerseyNumber"
        min={0}
        max={99}
        placeholder="#"
        value={jerseyNumber}
        onChange={(e) => setJerseyNumber(e.target.value)}
        className="w-14 border border-gray-300 rounded px-2 py-1 text-xs text-gray-900 focus:outline-none focus:ring-1 focus:ring-brand-500"
      />
      <ReactivateButton />
      <button
        type="button"
        onClick={() => setShowForm(false)}
        className="text-xs text-gray-400 hover:text-gray-600"
      >
        Cancel
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </form>
  );
}

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
                      ? new Date(player.disabledAt).toLocaleDateString()
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
                        <ReactivateForm player={player} teamId={teamId} />
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
