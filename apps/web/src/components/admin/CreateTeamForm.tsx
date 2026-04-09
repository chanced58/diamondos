'use client';
import type { JSX } from 'react';

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

      {/* Assign Head Coach (optional) */}
      <div className="border-t border-gray-200 pt-5 mt-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-1">Assign Head Coach</h3>
        <p className="text-xs text-gray-500 mb-4">
          Optionally invite someone as head coach. Leave blank to assign yourself.
        </p>

        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Coach email</label>
            <input
              type="email"
              name="coachEmail"
              placeholder="coach@school.edu"
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">First name</label>
              <input
                type="text"
                name="coachFirstName"
                placeholder="John"
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Last name</label>
              <input
                type="text"
                name="coachLastName"
                placeholder="Smith"
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>
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
