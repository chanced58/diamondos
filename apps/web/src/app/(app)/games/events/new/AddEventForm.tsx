'use client';
import type { JSX } from 'react';

import { useFormState, useFormStatus } from 'react-dom';
import { createTeamEventAction } from './actions';
import { AddressAutocomplete } from '@/components/maps/AddressAutocomplete';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full bg-brand-700 text-white font-semibold py-2.5 rounded-lg hover:bg-brand-800 disabled:opacity-50 transition-colors"
    >
      {pending ? 'Saving...' : 'Add Event'}
    </button>
  );
}

const inputClass =
  'w-full border border-gray-300 rounded-lg px-3 py-2.5 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent';

const selectClass =
  'w-full border border-gray-300 rounded-lg px-3 py-2.5 text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent';

export function AddEventForm({ teamId }: { teamId: string }): JSX.Element | null {
  const [error, formAction] = useFormState(createTeamEventAction, null);

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="teamId" value={teamId} />

      {/* Title */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Title <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          name="title"
          required
          placeholder="e.g. Team Meeting, Travel Day"
          className={inputClass}
        />
      </div>

      {/* Event type */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Event type</label>
        <select name="eventType" defaultValue="other" className={selectClass}>
          <option value="meeting">Team Meeting</option>
          <option value="scrimmage">Scrimmage</option>
          <option value="travel">Travel</option>
          <option value="other">Other</option>
        </select>
      </div>

      {/* Start date + time */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Start date <span className="text-red-500">*</span>
          </label>
          <input type="date" name="startDate" required className={inputClass} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Start time</label>
          <input type="time" name="startTime" defaultValue="09:00" className={inputClass} />
        </div>
      </div>

      {/* End date + time (optional) */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            End date <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <input type="date" name="endDate" className={inputClass} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">End time</label>
          <input type="time" name="endTime" className={inputClass} />
        </div>
      </div>

      {/* Location */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
        <AddressAutocomplete name="location" placeholder="e.g. Gymnasium, Coach's office" />
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
        <textarea
          name="description"
          rows={3}
          placeholder="Additional details for the team..."
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
