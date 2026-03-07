import type { JSX } from 'react';
'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { saveLineupAction } from './actions';

const POSITIONS = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'] as const;
const ORDER_OPTIONS = ['Bench', '1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;

type Player = {
  id: string;
  firstName: string;
  lastName: string;
  jerseyNumber: number | null;
  primaryPosition: string | null;
};

type LineupEntry = {
  playerId: string;
  battingOrder: number;
  startingPosition: string | null;
};

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-brand-700 text-white font-semibold px-5 py-2.5 rounded-lg hover:bg-brand-800 disabled:opacity-50 transition-colors"
    >
      {pending ? 'Saving...' : 'Save lineup'}
    </button>
  );
}

export function LineupBuilder({
  gameId,
  players,
  existingLineup,
}: {
  gameId: string;
  players: Player[];
  existingLineup: LineupEntry[];
}): JSX.Element | null {
  const [error, action] = useFormState(saveLineupAction, null);

  function getDefaultOrder(playerId: string): string {
    const entry = existingLineup.find((e) => e.playerId === playerId);
    return entry ? String(entry.battingOrder) : 'Bench';
  }

  function getDefaultPosition(playerId: string): string {
    const entry = existingLineup.find((e) => e.playerId === playerId);
    return entry?.startingPosition ?? '';
  }

  const sortedPlayers = [...players].sort((a, b) => {
    const aOrder = existingLineup.find((e) => e.playerId === a.id)?.battingOrder ?? 99;
    const bOrder = existingLineup.find((e) => e.playerId === b.id)?.battingOrder ?? 99;
    return aOrder - bOrder;
  });

  return (
    <form action={action}>
      <input type="hidden" name="gameId" value={gameId} />

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-12">#</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Player</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-32">Batting order</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-28">Position</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sortedPlayers.map((player) => (
              <tr key={player.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-mono text-gray-400 text-sm">
                  {player.jerseyNumber ?? '—'}
                </td>
                <td className="px-4 py-3 font-medium text-gray-900">
                  {player.lastName}, {player.firstName}
                  {player.primaryPosition && (
                    <span className="ml-2 text-xs text-gray-400">({player.primaryPosition})</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <select
                    name={`player_${player.id}_order`}
                    defaultValue={getDefaultOrder(player.id)}
                    className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                  >
                    {ORDER_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3">
                  <select
                    name={`player_${player.id}_position`}
                    defaultValue={getDefaultPosition(player.id)}
                    className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                  >
                    <option value="">—</option>
                    {POSITIONS.map((pos) => (
                      <option key={pos} value={pos}>{pos}</option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-400 mb-4">
        Set batting order 1–9 for starters. Players left as &quot;Bench&quot; will not appear in the batting order.
      </p>

      <div className="flex items-center gap-3">
        <SaveButton />
        <a href={`/games/${gameId}`} className="text-sm text-gray-500 hover:text-gray-700">
          Cancel
        </a>
      </div>
    </form>
  );
}
