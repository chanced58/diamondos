'use client';
import type { JSX } from 'react';

import { useFormState, useFormStatus } from 'react-dom';
import { inviteStaffAction } from './actions';

const ROLE_OPTIONS = [
  { value: 'assistant_coach',  label: 'Assistant Coach' },
  { value: 'athletic_director', label: 'Athletic Director' },
  { value: 'scorekeeper',      label: 'Scorekeeper' },
  { value: 'staff',            label: 'Staff' },
  { value: 'head_coach',       label: 'Head Coach' },
] as const;

const inputClass =
  'w-full border border-gray-300 rounded-lg px-3 py-2.5 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent';

const selectClass =
  'w-full border border-gray-300 rounded-lg px-3 py-2.5 text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full bg-brand-700 text-white font-semibold py-2.5 rounded-lg hover:bg-brand-800 disabled:opacity-50 transition-colors"
    >
      {pending ? 'Saving...' : 'Add to team'}
    </button>
  );
}

export function InviteStaffForm({ teamId }: { teamId: string }): JSX.Element | null {
  const [result, formAction] = useFormState(inviteStaffAction, null);

  const isSuccess = result === 'added' || result === 'invited';

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="teamId" value={teamId} />

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">First name</label>
          <input
            type="text"
            name="firstName"
            className={inputClass}
            placeholder="Jane"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Last name</label>
          <input
            type="text"
            name="lastName"
            className={inputClass}
            placeholder="Smith"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Role <span className="text-red-500">*</span>
        </label>
        <select name="role" required className={selectClass} defaultValue="assistant_coach">
          {ROLE_OPTIONS.map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input
            type="email"
            name="email"
            className={inputClass}
            placeholder="coach@example.com"
            autoComplete="email"
          />
          <p className="text-xs text-gray-400 mt-1">
            Optional — sends an invite to create an account.
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

      {isSuccess && (
        <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
          {result === 'added'
            ? 'Staff member added to the team.'
            : 'Invite email sent. They will be added when they accept.'}
        </div>
      )}

      {result && !isSuccess && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {result}
        </p>
      )}

      <SubmitButton />
    </form>
  );
}
