'use client';
import type { JSX } from 'react';

import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { updatePlayerAction, deactivatePlayerAction } from './actions';
import { reactivatePlayerAction } from '../actions';
import { PlayerPosition, BatsThrows, POSITION_ABBREVIATIONS } from '@baseball/shared';

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full bg-brand-700 text-white font-semibold py-2.5 rounded-lg hover:bg-brand-800 disabled:opacity-50 transition-colors"
    >
      {pending ? pendingLabel : label}
    </button>
  );
}

const inputClass =
  'w-full border border-gray-300 rounded-lg px-3 py-2.5 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent';

const selectClass =
  'w-full border border-gray-300 rounded-lg px-3 py-2.5 text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent';

type Player = {
  id: string;
  first_name: string;
  last_name: string;
  jersey_number: number | null;
  primary_position: string | null;
  secondary_positions: string[];
  bats: string | null;
  throws: string | null;
  graduation_year: number | null;
  email: string | null;
  phone: string | null;
};

export function EditPlayerForm({ player, teamId }: { player: Player; teamId: string }): JSX.Element | null {
  const [error, formAction] = useFormState(updatePlayerAction, null);
  const [primaryPos, setPrimaryPos] = useState<string>(player.primary_position ?? '');

  const secondaryOptions = Object.values(PlayerPosition).filter((pos) => pos !== primaryPos);

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="teamId" value={teamId} />
      <input type="hidden" name="playerId" value={player.id} />

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            First name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            name="firstName"
            required
            defaultValue={player.first_name}
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Last name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            name="lastName"
            required
            defaultValue={player.last_name}
            className={inputClass}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Jersey #</label>
          <input
            type="number"
            name="jerseyNumber"
            min={0}
            max={99}
            defaultValue={player.jersey_number ?? ''}
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Graduation year</label>
          <input
            type="number"
            name="graduationYear"
            min={2000}
            max={2100}
            defaultValue={player.graduation_year ?? ''}
            className={inputClass}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input
            type="email"
            name="email"
            defaultValue={player.email ?? ''}
            className={inputClass}
            placeholder="player@example.com"
            autoComplete="email"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
          <input
            type="tel"
            name="phone"
            defaultValue={player.phone ?? ''}
            className={inputClass}
            placeholder="(555) 000-0000"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Primary position</label>
        <select
          name="primaryPosition"
          className={selectClass}
          value={primaryPos}
          onChange={(e) => setPrimaryPos(e.target.value)}
        >
          <option value="">Select position</option>
          {Object.values(PlayerPosition).map((pos) => (
            <option key={pos} value={pos}>
              {POSITION_ABBREVIATIONS[pos]} — {pos.replace(/_/g, ' ')}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Secondary positions</label>
        <div className="grid grid-cols-2 gap-2 bg-gray-50 rounded-lg border border-gray-200 p-3">
          {secondaryOptions.map((pos) => (
            <label
              key={pos}
              className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none"
            >
              <input
                type="checkbox"
                name="secondaryPositions"
                value={pos}
                defaultChecked={player.secondary_positions.includes(pos)}
                className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
              />
              <span>
                {POSITION_ABBREVIATIONS[pos]} — {pos.replace(/_/g, ' ')}
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Bats</label>
          <select name="bats" className={selectClass} defaultValue={player.bats ?? ''}>
            <option value="">Select</option>
            {Object.values(BatsThrows).map((val) => (
              <option key={val} value={val}>
                {val.charAt(0).toUpperCase() + val.slice(1)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Throws</label>
          <select name="throws" className={selectClass} defaultValue={player.throws ?? ''}>
            <option value="">Select</option>
            {Object.values(BatsThrows).map((val) => (
              <option key={val} value={val}>
                {val.charAt(0).toUpperCase() + val.slice(1)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <SubmitButton label="Save changes" pendingLabel="Saving..." />
    </form>
  );
}

export function DeactivatePlayerForm({ player, teamId }: { player: Player; teamId: string }): JSX.Element | null {
  const [error, formAction] = useFormState(deactivatePlayerAction, null);

  return (
    <form action={formAction}>
      <input type="hidden" name="teamId" value={teamId} />
      <input type="hidden" name="playerId" value={player.id} />
      {error && (
        <p className="text-sm text-red-600 mb-2">{error}</p>
      )}
      <button
        type="submit"
        className="text-sm text-red-600 hover:text-red-800 underline"
        onClick={(e) => {
          if (!confirm(`Remove ${player.first_name} ${player.last_name} from the roster?`)) {
            e.preventDefault();
          }
        }}
      >
        Remove from roster
      </button>
    </form>
  );
}

export function ReactivatePlayerForm({ player, teamId }: { player: Player; teamId: string }): JSX.Element | null {
  const [error, formAction] = useFormState(reactivatePlayerAction, null);
  const [jerseyNumber, setJerseyNumber] = useState('');

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="teamId" value={teamId} />
      <input type="hidden" name="playerId" value={player.id} />
      <input
        type="number"
        name="jerseyNumber"
        min={0}
        max={99}
        placeholder="Jersey #"
        value={jerseyNumber}
        onChange={(e) => setJerseyNumber(e.target.value)}
        className="w-20 border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-brand-500"
      />
      {error && <span className="text-xs text-red-600">{error}</span>}
      <button
        type="submit"
        className="text-sm font-medium text-brand-700 hover:text-brand-800 bg-brand-50 border border-brand-200 px-3 py-1.5 rounded-lg transition-colors"
        onClick={(e) => {
          if (!confirm(`Reactivate ${player.first_name} ${player.last_name} to the roster?`)) {
            e.preventDefault();
          }
        }}
      >
        Reactivate
      </button>
    </form>
  );
}
