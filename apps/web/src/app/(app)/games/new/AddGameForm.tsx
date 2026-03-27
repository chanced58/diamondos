'use client';
import type { JSX } from 'react';

import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { createGameAction } from './actions';
import { AddressAutocomplete } from '@/components/maps/AddressAutocomplete';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full bg-brand-700 text-white font-semibold py-2.5 rounded-lg hover:bg-brand-800 disabled:opacity-50 transition-colors"
    >
      {pending ? 'Scheduling...' : 'Schedule Game'}
    </button>
  );
}

const inputClass =
  'w-full border border-gray-300 rounded-lg px-3 py-2.5 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent';

const selectClass =
  'w-full border border-gray-300 rounded-lg px-3 py-2.5 text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent';

export function AddGameForm({ teamId }: { teamId: string }): JSX.Element | null {
  const [error, formAction] = useFormState(createGameAction, null);
  const [locationType, setLocationType] = useState('home');

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="teamId" value={teamId} />

      {/* Opponent */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Opponent <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          name="opponent"
          required
          placeholder="e.g. Central High School"
          className={inputClass}
        />
      </div>

      {/* Date + Time */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Date <span className="text-red-500">*</span>
          </label>
          <input type="date" name="date" required className={inputClass} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Time</label>
          <input type="time" name="time" defaultValue="16:00" className={inputClass} />
        </div>
      </div>

      {/* Location type */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
        <select
          name="locationType"
          value={locationType}
          onChange={(e) => setLocationType(e.target.value)}
          className={selectClass}
        >
          <option value="home">Home</option>
          <option value="away">Away</option>
          <option value="neutral">Neutral site</option>
        </select>
      </div>

      {/* Neutral site — home team designation */}
      {locationType === 'neutral' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Home team</label>
          <select name="neutralHomeTeam" defaultValue="us" className={selectClass}>
            <option value="us">Us</option>
            <option value="opponent">Opponent</option>
          </select>
          <p className="text-xs text-gray-400 mt-1">
            The home team bats in the bottom of each inning.
          </p>
        </div>
      )}

      {/* Venue */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Venue / Field</label>
        <AddressAutocomplete name="venue" placeholder="e.g. Riverside Baseball Complex" />
      </div>

      {/* Notes */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
        <textarea
          name="notes"
          rows={3}
          placeholder="Any additional notes for the team..."
          className={inputClass}
        />
      </div>

      {/* Notify team */}
      <div className="border-t border-gray-100 pt-4">
        <label className="flex items-center gap-2.5 cursor-pointer select-none">
          <input
            type="checkbox"
            name="notifyTeam"
            defaultChecked
            className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
          />
          <div>
            <p className="text-sm font-medium text-gray-700">Notify team</p>
            <p className="text-xs text-gray-400">Post an alert to the announcements channel</p>
          </div>
        </label>
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
