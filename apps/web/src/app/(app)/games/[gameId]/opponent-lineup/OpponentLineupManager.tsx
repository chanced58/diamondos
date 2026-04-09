'use client';
import type { JSX } from 'react';

import { useRef, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import {
  saveOpponentTeamAction,
  addOpponentPlayerAction,
  removeOpponentPlayerAction,
  saveOpponentLineupAction,
} from './actions';

const POSITIONS = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'] as const;
const ORDER_OPTIONS = ['Bench', '1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;

const DB_TO_POSITION: Record<string, string> = {
  pitcher: 'P',
  catcher: 'C',
  first_base: '1B',
  second_base: '2B',
  third_base: '3B',
  shortstop: 'SS',
  left_field: 'LF',
  center_field: 'CF',
  right_field: 'RF',
  designated_hitter: 'DH',
  infield: 'IF',
  outfield: 'OF',
};

type OpponentTeam = {
  id: string;
  name: string;
};

type OpponentPlayer = {
  id: string;
  firstName: string;
  lastName: string;
  jerseyNumber: string | null;
  primaryPosition: string | null;
};

type LineupEntry = {
  playerId: string;
  battingOrder: number;
  startingPosition: string | null;
};

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-brand-700 text-white font-semibold px-4 py-2 rounded-lg text-sm hover:bg-brand-800 disabled:opacity-50 transition-colors"
    >
      {pending ? pendingLabel : label}
    </button>
  );
}

function DestructiveButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="text-sm text-red-600 hover:text-red-800 disabled:opacity-50 transition-colors"
    >
      {pending ? pendingLabel : label}
    </button>
  );
}

/** Section 1: Set or rename the opponent team. */
function OpponentTeamSection({
  gameId,
  opponentTeam,
  defaultName,
}: {
  gameId: string;
  opponentTeam: OpponentTeam | null;
  defaultName: string;
}): JSX.Element {
  const [error, action] = useFormState(saveOpponentTeamAction, null);

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
      <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
        <h2 className="text-sm font-semibold text-gray-700">Opponent Team</h2>
      </div>
      <div className="px-5 py-5">
        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}
        <form action={action} className="flex items-end gap-3">
          <input type="hidden" name="gameId" value={gameId} />
          {opponentTeam && (
            <input type="hidden" name="opponentTeamId" value={opponentTeam.id} />
          )}
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Team name</label>
            <input
              type="text"
              name="teamName"
              required
              defaultValue={opponentTeam?.name ?? defaultName}
              placeholder="e.g. Lincoln Eagles"
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            />
          </div>
          <SubmitButton
            label={opponentTeam ? 'Update name' : 'Create team'}
            pendingLabel="Saving..."
          />
        </form>
        {opponentTeam && (
          <p className="mt-2 text-xs text-gray-400">
            This team record is reusable across games.
          </p>
        )}
      </div>
    </div>
  );
}

/** Section 2: Add players to the opponent team roster. */
function OpponentRosterSection({
  gameId,
  opponentTeamId,
  players,
}: {
  gameId: string;
  opponentTeamId: string;
  players: OpponentPlayer[];
}): JSX.Element {
  const [removeError, removeAction] = useFormState(removeOpponentPlayerAction, null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [addPending, setAddPending] = useState(false);
  const addFormRef = useRef<HTMLFormElement>(null);

  async function handleAddPlayer(formData: FormData) {
    setAddPending(true);
    setAddError(null);
    try {
      const result = await addOpponentPlayerAction(null, formData);
      if (result) {
        setAddError(result);
      } else {
        addFormRef.current?.reset();
      }
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to add player.');
    } finally {
      setAddPending(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
      <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700">Roster</h2>
        <button
          type="button"
          onClick={() => setShowAddForm((v) => !v)}
          className="text-xs font-medium text-brand-700 hover:underline"
        >
          {showAddForm ? 'Cancel' : '+ Add player'}
        </button>
      </div>

      {/* Add player form */}
      {showAddForm && (
        <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
          {addError && (
            <div className="mb-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">
              {addError}
            </div>
          )}
          <form ref={addFormRef} action={handleAddPlayer} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="gameId" value={gameId} />
            <input type="hidden" name="opponentTeamId" value={opponentTeamId} />
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">#</label>
              <input
                type="text"
                name="jerseyNumber"
                placeholder="00"
                className="w-14 border border-gray-300 rounded px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">First name</label>
              <input
                type="text"
                name="firstName"
                required
                placeholder="First"
                className="w-28 border border-gray-300 rounded px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Last name</label>
              <input
                type="text"
                name="lastName"
                required
                placeholder="Last"
                className="w-28 border border-gray-300 rounded px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Position</label>
              <select
                name="primaryPosition"
                className="border border-gray-300 rounded px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="">—</option>
                {POSITIONS.map((pos) => (
                  <option key={pos} value={pos}>{pos}</option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              disabled={addPending}
              className="bg-brand-700 text-white font-semibold px-4 py-2 rounded-lg text-sm hover:bg-brand-800 disabled:opacity-50 transition-colors"
            >
              {addPending ? 'Adding...' : 'Add'}
            </button>
          </form>
        </div>
      )}

      {/* Section-level remove error banner */}
      {removeError && (
        <div className="px-5 py-2 bg-red-50 border-b border-red-200 text-xs text-red-700">
          {removeError}
        </div>
      )}

      {/* Player list */}
      {players.length === 0 ? (
        <div className="px-5 py-6 text-sm text-gray-400 text-center">
          No players added yet. Add players above to build the batting order.
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead className="border-b border-gray-100">
            <tr>
              <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide w-12">#</th>
              <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Player</th>
              <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide w-16">Pos</th>
              <th className="w-16" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {players.map((player) => (
              <tr key={player.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-mono text-gray-400 text-sm">
                  {player.jerseyNumber ?? '—'}
                </td>
                <td className="px-4 py-3 font-medium text-gray-900">
                  {player.lastName}, {player.firstName}
                </td>
                <td className="px-4 py-3 text-gray-500">
                  {player.primaryPosition
                    ? (DB_TO_POSITION[player.primaryPosition] ?? player.primaryPosition)
                    : '—'}
                </td>
                <td className="px-4 py-3 text-right">
                  <form action={removeAction} className="inline">
                    <input type="hidden" name="gameId" value={gameId} />
                    <input type="hidden" name="playerId" value={player.id} />
                    <DestructiveButton label="Remove" pendingLabel="..." />
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/** Section 3: Set batting order and positions for this game. */
function OpponentBattingOrderSection({
  gameId,
  players,
  existingLineup,
}: {
  gameId: string;
  players: OpponentPlayer[];
  existingLineup: LineupEntry[];
}): JSX.Element {
  const [error, action] = useFormState(saveOpponentLineupAction, null);

  function getDefaultOrder(playerId: string): string {
    const entry = existingLineup.find((e) => e.playerId === playerId);
    return entry ? String(entry.battingOrder) : 'Bench';
  }

  function getDefaultPosition(playerId: string): string {
    const entry = existingLineup.find((e) => e.playerId === playerId);
    return entry?.startingPosition ? (DB_TO_POSITION[entry.startingPosition] ?? entry.startingPosition) : '';
  }

  const sortedPlayers = [...players].sort((a, b) => {
    const aOrder = existingLineup.find((e) => e.playerId === a.id)?.battingOrder ?? 99;
    const bOrder = existingLineup.find((e) => e.playerId === b.id)?.battingOrder ?? 99;
    return aOrder - bOrder;
  });

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
      <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
        <h2 className="text-sm font-semibold text-gray-700">Batting Order</h2>
      </div>
      {players.length === 0 ? (
        <div className="px-5 py-6 text-sm text-gray-400 text-center">
          Add players to the roster above before setting the batting order.
        </div>
      ) : (
        <form action={action} className="px-5 py-5">
          <input type="hidden" name="gameId" value={gameId} />

          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <table className="w-full text-sm mb-4">
            <thead className="border-b border-gray-100">
              <tr>
                <th className="text-left pb-2 text-xs font-semibold text-gray-500 uppercase tracking-wide w-12">#</th>
                <th className="text-left pb-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Player</th>
                <th className="text-left pb-2 text-xs font-semibold text-gray-500 uppercase tracking-wide w-32">Batting order</th>
                <th className="text-left pb-2 text-xs font-semibold text-gray-500 uppercase tracking-wide w-28">Position</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sortedPlayers.map((player) => (
                <tr key={player.id} className="hover:bg-gray-50">
                  <td className="py-3 font-mono text-gray-400 text-sm pr-4">
                    {player.jerseyNumber ?? '—'}
                  </td>
                  <td className="py-3 font-medium text-gray-900 pr-4">
                    {player.lastName}, {player.firstName}
                    {player.primaryPosition && (
                      <span className="ml-2 text-xs text-gray-400">
                        ({DB_TO_POSITION[player.primaryPosition] ?? player.primaryPosition})
                      </span>
                    )}
                  </td>
                  <td className="py-3 pr-4">
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
                  <td className="py-3">
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

          <p className="text-xs text-gray-400 mb-4">
            Set batting order 1–9 for starters. Players left as &quot;Bench&quot; will not appear in the order.
            Exception: a player set to &quot;Bench&quot; with position P is saved as the starting pitcher without a
            batting slot — use this for DH rules where the pitcher does not bat.
          </p>

          <SubmitButton label="Save batting order" pendingLabel="Saving..." />
        </form>
      )}
    </div>
  );
}

export function OpponentLineupManager({
  gameId,
  opponentTeam,
  defaultOpponentName,
  players,
  existingLineup,
}: {
  gameId: string;
  opponentTeam: OpponentTeam | null;
  defaultOpponentName: string;
  players: OpponentPlayer[];
  existingLineup: LineupEntry[];
}): JSX.Element {
  return (
    <div>
      <OpponentTeamSection
        gameId={gameId}
        opponentTeam={opponentTeam}
        defaultName={defaultOpponentName}
      />

      {opponentTeam && (
        <>
          <OpponentRosterSection
            gameId={gameId}
            opponentTeamId={opponentTeam.id}
            players={players}
          />
          <OpponentBattingOrderSection
            gameId={gameId}
            players={players}
            existingLineup={existingLineup}
          />
        </>
      )}

      {!opponentTeam && (
        <p className="text-sm text-gray-400">
          Create the opponent team record above to start adding players.
        </p>
      )}
    </div>
  );
}
