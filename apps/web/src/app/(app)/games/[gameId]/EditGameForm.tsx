'use client';
import type { JSX } from 'react';

import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { updateGameAction } from './actions';
import { AddressAutocomplete } from '@/components/maps/AddressAutocomplete';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-brand-700 text-white font-semibold px-6 py-2.5 rounded-lg hover:bg-brand-800 disabled:opacity-50 transition-colors"
    >
      {pending ? 'Saving...' : 'Save changes'}
    </button>
  );
}

const inputClass =
  'w-full border border-gray-300 rounded-lg px-3 py-2.5 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent';

const selectClass =
  'w-full border border-gray-300 rounded-lg px-3 py-2.5 text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent';

type Props = {
  gameId: string;
  defaultOpponent: string;
  defaultDate: string;   // YYYY-MM-DD
  defaultTime: string;   // HH:MM
  defaultLocationType: string;
  defaultNeutralHomeTeam: string;
  defaultVenue: string;
  defaultNotes: string;
  onCancel: () => void;
};

export function EditGameForm({
  gameId,
  defaultOpponent,
  defaultDate,
  defaultTime,
  defaultLocationType,
  defaultNeutralHomeTeam,
  defaultVenue,
  defaultNotes,
  onCancel,
}: Props): JSX.Element | null {
  const [error, formAction] = useFormState(updateGameAction, null);
  const [locationType, setLocationType] = useState(defaultLocationType);

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="gameId" value={gameId} />

      {/* Opponent */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Opponent <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          name="opponent"
          required
          defaultValue={defaultOpponent}
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
          <input type="date" name="date" required defaultValue={defaultDate} className={inputClass} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Time</label>
          <input type="time" name="time" defaultValue={defaultTime} className={inputClass} />
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
          <select name="neutralHomeTeam" defaultValue={defaultNeutralHomeTeam || 'us'} className={selectClass}>
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
        <AddressAutocomplete name="venue" defaultValue={defaultVenue} placeholder="e.g. Riverside Baseball Complex" />
      </div>

      {/* Notes */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
        <textarea
          name="notes"
          rows={3}
          defaultValue={defaultNotes}
          placeholder="Any additional notes for the team..."
          className={inputClass}
        />
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3 justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2.5 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors"
        >
          Cancel
        </button>
        <SubmitButton />
      </div>
    </form>
  );
}
