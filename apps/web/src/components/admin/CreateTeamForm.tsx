import type { JSX } from 'react';
'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { createTeamAction } from '@/app/(app)/admin/create-team/actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full bg-brand-700 text-white font-semibold py-2.5 rounded-lg hover:bg-brand-800 disabled:opacity-50 transition-colors"
    >
      {pending ? 'Creating...' : 'Create team'}
    </button>
  );
}

export function CreateTeamForm(): JSX.Element | null {
  const [error, formAction] = useFormState(createTeamAction, null);

  return (
    <form action={formAction} className="space-y-5">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Team name <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          name="name"
          placeholder="Riverside High Falcons"
          required
          className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">School / Organization</label>
        <input
          type="text"
          name="organization"
          placeholder="Riverside High School"
          className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">State (for pitch limits)</label>
        <input
          type="text"
          name="stateCode"
          placeholder="CA"
          maxLength={2}
          className="w-24 border border-gray-300 rounded-lg px-3 py-2.5 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
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
