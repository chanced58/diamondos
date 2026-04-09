'use client';
import type { JSX } from 'react';

import { useFormState, useFormStatus } from 'react-dom';
import { createOpponentTeamAction } from '../actions';

const inputClass =
  'w-full border border-gray-300 rounded-lg px-3 py-2.5 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full bg-brand-700 text-white font-semibold py-2.5 rounded-lg hover:bg-brand-800 disabled:opacity-50 transition-colors"
    >
      {pending ? 'Creating...' : 'Create Opponent Team'}
    </button>
  );
}

export function CreateOpponentForm({ teamId }: { teamId: string }): JSX.Element {
  const [error, formAction] = useFormState(createOpponentTeamAction, null);

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="teamId" value={teamId} />

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Team name <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          name="name"
          required
          placeholder="e.g. Lincoln Eagles"
          className={inputClass}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Abbreviation
        </label>
        <input
          type="text"
          name="abbreviation"
          placeholder="e.g. LEA"
          maxLength={6}
          className={inputClass}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
          <input type="text" name="city" placeholder="City" className={inputClass} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
          <input
            type="text"
            name="stateCode"
            placeholder="e.g. TX"
            maxLength={2}
            className={inputClass}
          />
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
