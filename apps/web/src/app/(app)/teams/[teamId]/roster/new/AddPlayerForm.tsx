import type { JSX } from 'react';
'use client';

import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { addPlayerAction } from './actions';
import { PlayerPosition, BatsThrows } from '@baseball/shared';
import { POSITION_ABBREVIATIONS } from '@baseball/shared';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full bg-brand-700 text-white font-semibold py-2.5 rounded-lg hover:bg-brand-800 disabled:opacity-50 transition-colors"
    >
      {pending ? 'Adding...' : 'Add player'}
    </button>
  );
}

const inputClass =
  'w-full border border-gray-300 rounded-lg px-3 py-2.5 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent';

const selectClass =
  'w-full border border-gray-300 rounded-lg px-3 py-2.5 text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent';

export function AddPlayerForm({ teamId }: { teamId: string }): JSX.Element | null {
  const [error, formAction] = useFormState(addPlayerAction, null);
  const [primaryPos, setPrimaryPos] = useState<string>('');

  const secondaryOptions = Object.values(PlayerPosition).filter((pos) => pos !== primaryPos);

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="teamId" value={teamId} />

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            First name <span className="text-red-500">*</span>
          </label>
          <input type="text" name="firstName" required className={inputClass} placeholder="John" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Last name <span className="text-red-500">*</span>
          </label>
          <input type="text" name="lastName" required className={inputClass} placeholder="Smith" />
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
            className={inputClass}
            placeholder="7"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Graduation year</label>
          <input
            type="number"
            name="graduationYear"
            min={2000}
            max={2100}
            className={inputClass}
            placeholder="2027"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input
            type="email"
            name="email"
            className={inputClass}
            placeholder="player@example.com"
            autoComplete="email"
          />
          <p className="text-xs text-gray-400 mt-1">
            Optional — invite the player to view their stats and schedule.
          </p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
          <input
            type="tel"
            name="phone"
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

      {primaryPos && (
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
                  className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                />
                <span>
                  {POSITION_ABBREVIATIONS[pos]} — {pos.replace(/_/g, ' ')}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Bats</label>
          <select name="bats" className={selectClass} defaultValue="">
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
          <select name="throws" className={selectClass} defaultValue="">
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

      <SubmitButton />
    </form>
  );
}
