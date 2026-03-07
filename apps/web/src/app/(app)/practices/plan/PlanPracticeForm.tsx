'use client';
import type { JSX } from 'react';

import { useFormState, useFormStatus } from 'react-dom';
import { planPracticeAction } from './actions';
import { AddressAutocomplete } from '@/components/maps/AddressAutocomplete';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full bg-brand-700 text-white font-semibold py-2.5 rounded-lg hover:bg-brand-800 disabled:opacity-50 transition-colors"
    >
      {pending ? 'Saving…' : 'Save practice plan →'}
    </button>
  );
}

const inputClass =
  'w-full border border-gray-300 rounded-lg px-3 py-2.5 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent';

export function PlanPracticeForm({ teamId }: { teamId: string }): JSX.Element | null {
  const [error, formAction] = useFormState(planPracticeAction, null);

  // Default date = tomorrow
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const defaultDate = tomorrow.toISOString().slice(0, 10);

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
            defaultValue={defaultDate}
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

      {/* Practice plan → saved as coach_notes */}
      <div className="border-t border-gray-100 pt-5">
        <div className="flex items-center justify-between mb-1">
          <label className="block text-sm font-medium text-gray-700">
            Practice Plan
          </label>
          <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
            Coaches only
          </span>
        </div>
        <textarea
          name="plan"
          rows={8}
          placeholder="Write your practice agenda, drills, and goals…&#10;&#10;e.g.&#10;Warm-up: 10 min dynamic stretch&#10;Hitting: 3 rounds BP, focus on gap coverage&#10;Fielding: double-play turns at middle infield&#10;Pitching/Throwing: bullpen sessions (15 pitches each)"
          className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent resize-y"
        />
        <p className="text-xs text-gray-400 mt-1">
          Saved as your Coach&apos;s Notes — visible only to coaches on the practice detail page.
        </p>
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
