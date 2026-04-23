'use client';
import { useState, type JSX } from 'react';

import { useFormState, useFormStatus } from 'react-dom';
import { planPracticeAction } from './actions';
import { AddressAutocomplete } from '@/components/maps/AddressAutocomplete';
import type { PracticeDrill } from '@baseball/shared';
import { DrillPicker } from '../templates/DrillPicker';

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

interface Props {
  teamId: string;
  drills: PracticeDrill[];
}

export function PlanPracticeForm({ teamId, drills }: Props): JSX.Element | null {
  const [error, formAction] = useFormState(planPracticeAction, null);
  const [selectedDrills, setSelectedDrills] = useState<PracticeDrill[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);

  // Default date = tomorrow
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const defaultDate = tomorrow.toISOString().slice(0, 10);

  return (
    <>
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="teamId" value={teamId} />
      <input
        type="hidden"
        name="drill_ids"
        value={JSON.stringify(selectedDrills.map((d) => d.id))}
      />

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

      {/* Drills ─ added as structured practice_blocks */}
      <div className="border-t border-gray-100 pt-5">
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-medium text-gray-700">Drills</label>
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="text-sm text-brand-700 hover:underline"
          >
            + Add drill
          </button>
        </div>
        {selectedDrills.length === 0 ? (
          <p className="text-xs text-gray-400">
            Optionally pre-load drills — you can reorder and fine-tune them later in the plan
            builder.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {selectedDrills.map((drill, idx) => (
              <li
                key={`${drill.id}-${idx}`}
                className="inline-flex items-center gap-1.5 bg-brand-50 border border-brand-200 text-brand-800 text-xs font-medium px-2.5 py-1 rounded-full"
              >
                <span>{drill.name}</span>
                {drill.defaultDurationMinutes !== undefined && (
                  <span className="text-brand-600/70">· {drill.defaultDurationMinutes}m</span>
                )}
                <button
                  type="button"
                  onClick={() =>
                    setSelectedDrills((arr) => arr.filter((_, i) => i !== idx))
                  }
                  aria-label={`Remove ${drill.name}`}
                  className="text-brand-500 hover:text-red-500 ml-0.5"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <SubmitButton />
    </form>

    {/* Mounted outside the <form> so Enter inside the picker's search input
        doesn't submit the practice form. */}
    {pickerOpen && (
      <DrillPicker
        drills={drills}
        onPick={(d) => {
          setSelectedDrills((arr) => [...arr, d]);
          setPickerOpen(false);
        }}
        onClose={() => setPickerOpen(false)}
      />
    )}
    </>
  );
}
