'use client';
import type { JSX } from 'react';

import { useFormState, useFormStatus } from 'react-dom';
import { createLeagueAction } from '@/app/(app)/admin/leagues/create/actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full bg-brand-700 text-white font-semibold py-2.5 rounded-lg hover:bg-brand-800 disabled:opacity-50 transition-colors"
    >
      {pending ? 'Creating...' : 'Create league'}
    </button>
  );
}

export function CreateLeagueForm(): JSX.Element | null {
  const [error, formAction] = useFormState(createLeagueAction, null);

  return (
    <form action={formAction} className="space-y-5">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          League name <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          name="name"
          placeholder="Central Texas High School League"
          required
          className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
        <textarea
          name="description"
          placeholder="A brief description of the league"
          rows={3}
          className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
        <input
          type="text"
          name="stateCode"
          placeholder="TX"
          maxLength={2}
          className="w-24 border border-gray-300 rounded-lg px-3 py-2.5 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>

      {/* Assign League Admin (optional) */}
      <div className="border-t border-gray-200 pt-5 mt-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-1">Assign League Admin</h3>
        <p className="text-xs text-gray-500 mb-4">
          Optionally invite someone as league admin. Leave blank to assign yourself.
        </p>

        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Admin email</label>
            <input
              type="email"
              name="adminEmail"
              placeholder="admin@league.org"
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">First name</label>
              <input
                type="text"
                name="adminFirstName"
                placeholder="Jane"
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Last name</label>
              <input
                type="text"
                name="adminLastName"
                placeholder="Doe"
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
