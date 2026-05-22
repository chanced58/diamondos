'use client';
import type { JSX } from 'react';

import { useTransition } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';
import { saveLineupAction } from './actions';
import { removeGuestFromLineupAction } from './guest-actions';
import { GuestPlayerPicker } from './GuestPlayerPicker';

const POSITIONS = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'] as const;

function orderOptions(rosterSize: number, maxBatters: number): readonly string[] {
  const cap = Math.min(Math.max(rosterSize, 9), maxBatters);
  return ['Bench', ...Array.from({ length: cap }, (_, i) => String(i + 1))];
}

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

export type GuestLineupEntry = {
  lineupId: string;
  playerId: string;
  battingOrder: number | null;
  displayName: string;
  jerseyNumber: number | null;
  countTowardStats: boolean;
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
  maxBatters,
  guests = [],
  guestsAllowed = false,
  guestStatsDefault = true,
}: {
  gameId: string;
  players: Player[];
  existingLineup: LineupEntry[];
  maxBatters: number;
  guests?: GuestLineupEntry[];
  guestsAllowed?: boolean;
  guestStatsDefault?: boolean;
}): JSX.Element | null {
  const [error, action] = useFormState(saveLineupAction, null);
  const router = useRouter();
  const [isRemoving, startRemove] = useTransition();

  function handleRemoveGuest(lineupId: string) {
    startRemove(() => {
      void (async () => {
        const res = await removeGuestFromLineupAction({ gameId, lineupId });
        if (!('error' in res)) router.refresh();
      })();
    });
  }

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

  const options = orderOptions(players.length, maxBatters);

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
                    {options.map((opt) => (
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
        Set the batting order (1 and up) for batters. Players left as &quot;Bench&quot; will not appear in
        the batting order. Exception: a player set to &quot;Bench&quot; with position P is saved as
        the starting pitcher without a batting slot — use this for DH rules where the pitcher
        does not bat. Defensive positions are optional; leave them blank to use position-only
        error tracking (placeholders) when you don&apos;t want to assign a player.
      </p>

      <div className="flex items-center gap-3">
        <SaveButton />
        <a href={`/games/${gameId}`} className="text-sm text-gray-500 hover:text-gray-700">
          Cancel
        </a>
      </div>

      {guestsAllowed && (
        <div className="mt-6 bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Guest players</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Non-roster players appearing in this game only.
              </p>
            </div>
            <GuestPlayerPicker
              gameId={gameId}
              defaultCountTowardStats={guestStatsDefault}
            />
          </div>
          {guests.length === 0 ? (
            <p className="px-4 py-3 text-xs text-gray-400">No guest players yet.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {guests.map((g) => (
                <li key={g.lineupId} className="px-4 py-2 flex items-center justify-between">
                  <div className="text-sm">
                    <span className="text-gray-400 font-mono w-8 inline-block">
                      {g.battingOrder ?? '—'}
                    </span>
                    <span className="text-gray-900 font-medium">{g.displayName}</span>
                    {g.jerseyNumber != null && (
                      <span className="ml-2 text-xs text-gray-400">#{g.jerseyNumber}</span>
                    )}
                    <span className="ml-2 text-xs px-2 py-0.5 rounded bg-amber-50 text-amber-700">
                      guest
                    </span>
                    {!g.countTowardStats && (
                      <span className="ml-2 text-xs text-gray-400">stats off</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveGuest(g.lineupId)}
                    disabled={isRemoving}
                    className="text-xs text-red-600 hover:text-red-800 disabled:opacity-50"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </form>
  );
}
