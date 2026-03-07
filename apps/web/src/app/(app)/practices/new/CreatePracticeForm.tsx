import type { JSX } from 'react';
'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { createPracticeAction } from './actions';
import { AddressAutocomplete } from '@/components/maps/AddressAutocomplete';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full bg-brand-700 text-white font-semibold py-2.5 rounded-lg hover:bg-brand-800 disabled:opacity-50 transition-colors"
    >
      {pending ? 'Creating...' : 'Create practice'}
    </button>
  );
}

const inputClass =
  'w-full border border-gray-300 rounded-lg px-3 py-2.5 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent';

export function CreatePracticeForm({ teamId }: { teamId: string }): JSX.Element | null {
  const [error, formAction] = useFormState(createPracticeAction, null);

  // Default date = today
  const today = new Date().toISOString().slice(0, 10);

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="teamId" value={teamId} />

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Date <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            name="date"
            required
            defaultValue={today}
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Start time</label>
          <input
            type="time"
            name="time"
            defaultValue="15:30"
            className={inputClass}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
          <AddressAutocomplete name="location" placeholder="Main field" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Duration (minutes)</label>
          <input
            type="number"
            name="duration"
            placeholder="90"
            min={15}
            max={480}
            className={inputClass}
          />
        </div>
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
