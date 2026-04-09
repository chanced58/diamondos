'use client';
import type { JSX } from 'react';

import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import {
  updateOpponentTeamAction,
  addPlayerAction,
  removePlayerAction,
} from '../actions';

const POSITIONS = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'] as const;

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
  abbreviation: string | null;
  city: string | null;
  stateCode: string | null;
};

type OpponentPlayer = {
  id: string;
  firstName: string;
  lastName: string;
  jerseyNumber: string | null;
  primaryPosition: string | null;
  bats: string | null;
  throws: string | null;
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

function TeamDetailsSection({ team }: { team: OpponentTeam }): JSX.Element {
  const [error, action] = useFormState(updateOpponentTeamAction, null);

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
      <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
        <h2 className="text-sm font-semibold text-gray-700">Team Details</h2>
      </div>
      <div className="px-5 py-5">
        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}
        <form action={action} className="space-y-4">
          <input type="hidden" name="opponentTeamId" value={team.id} />
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Team name</label>
              <input
                type="text"
                name="name"
                required
                defaultValue={team.name}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Abbreviation</label>
              <input
                type="text"
                name="abbreviation"
                defaultValue={team.abbreviation ?? ''}
                maxLength={6}
                placeholder="e.g. CHS"
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
              <input
                type="text"
                name="city"
                defaultValue={team.city ?? ''}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
              <input
                type="text"
                name="stateCode"
                defaultValue={team.stateCode ?? ''}
                maxLength={2}
                placeholder="e.g. TX"
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              />
            </div>
          </div>
          <SubmitButton label="Save changes" pendingLabel="Saving..." />
        </form>
      </div>
    </div>
  );
}

function RosterSection({
  opponentTeamId,
  players,
}: {
  opponentTeamId: string;
  players: OpponentPlayer[];
}): JSX.Element {
  const [addError, addAction] = useFormState(addPlayerAction, null);
  const [removeError, removeAction] = useFormState(removePlayerAction, null);
  const [showAddForm, setShowAddForm] = useState(false);

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
      <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700">Roster ({players.length})</h2>
        <button
          type="button"
          onClick={() => setShowAddForm((v) => !v)}
          className="text-xs font-medium text-brand-700 hover:underline"
        >
          {showAddForm ? 'Cancel' : '+ Add player'}
        </button>
      </div>

      {showAddForm && (
        <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
          {addError && (
            <div className="mb-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">
              {addError}
            </div>
          )}
          <form action={addAction} className="flex flex-wrap items-end gap-2">
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
                <option value="">--</option>
                {POSITIONS.map((pos) => (
                  <option key={pos} value={pos}>{pos}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Bats</label>
              <select
                name="bats"
                className="border border-gray-300 rounded px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="">--</option>
                <option value="right">R</option>
                <option value="left">L</option>
                <option value="switch">S</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Throws</label>
              <select
                name="throws"
                className="border border-gray-300 rounded px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="">--</option>
                <option value="right">R</option>
                <option value="left">L</option>
              </select>
            </div>
            <SubmitButton label="Add" pendingLabel="Adding..." />
          </form>
        </div>
      )}

      {removeError && (
        <div className="px-5 py-2 bg-red-50 border-b border-red-200 text-xs text-red-700">
          {removeError}
        </div>
      )}

      {players.length === 0 ? (
        <div className="px-5 py-6 text-sm text-gray-400 text-center">
          No players added yet. Click &quot;+ Add player&quot; to build the roster.
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead className="border-b border-gray-100">
            <tr>
              <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide w-12">#</th>
              <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Player</th>
              <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide w-16">Pos</th>
              <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide w-12">B/T</th>
              <th className="w-16" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {players.map((player) => (
              <tr key={player.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-mono text-gray-400 text-sm">
                  {player.jerseyNumber ?? '--'}
                </td>
                <td className="px-4 py-3 font-medium text-gray-900">
                  {player.lastName}, {player.firstName}
                </td>
                <td className="px-4 py-3 text-gray-500">
                  {player.primaryPosition
                    ? (DB_TO_POSITION[player.primaryPosition] ?? player.primaryPosition)
                    : '--'}
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs">
                  {(player.bats ? player.bats[0].toUpperCase() : '-')}/{(player.throws ? player.throws[0].toUpperCase() : '-')}
                </td>
                <td className="px-4 py-3 text-right">
                  <form action={removeAction} className="inline">
                    <input type="hidden" name="opponentTeamId" value={opponentTeamId} />
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

export function OpponentRosterClient({
  team,
  players,
}: {
  team: OpponentTeam;
  players: OpponentPlayer[];
}): JSX.Element {
  return (
    <div>
      <TeamDetailsSection team={team} />
      <RosterSection opponentTeamId={team.id} players={players} />
    </div>
  );
}
