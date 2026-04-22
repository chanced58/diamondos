'use client';
import { useFormState, useFormStatus } from 'react-dom';
import type { JSX } from 'react';
import { createBookingAction } from './actions';

type Facility = { id: string; name: string; kind: string };

export function NewBookingForm({
  facilities,
  defaultDate,
}: {
  facilities: Facility[];
  defaultDate: string;
}): JSX.Element {
  const [error, formAction] = useFormState(createBookingAction, null);

  return (
    <form action={formAction} className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <label className="block">
          <span className="text-xs font-medium text-gray-700">Facility</span>
          <select
            name="facilityId"
            required
            className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
          >
            {facilities.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name} ({f.kind})
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-medium text-gray-700">Date</span>
          <input
            name="date"
            type="date"
            defaultValue={defaultDate}
            required
            className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-gray-700">Title</span>
          <input
            name="title"
            type="text"
            required
            maxLength={120}
            placeholder="Varsity cage work"
            className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-gray-700">Start</span>
          <input
            name="startTime"
            type="time"
            required
            className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-gray-700">End</span>
          <input
            name="endTime"
            type="time"
            required
            className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
          />
        </label>
      </div>
      <label className="block">
        <span className="text-xs font-medium text-gray-700">Notes (optional)</span>
        <input
          name="notes"
          type="text"
          maxLength={250}
          className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
        />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <SubmitButton />
    </form>
  );
}

function SubmitButton(): JSX.Element {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50"
    >
      {pending ? 'Booking…' : 'Book facility'}
    </button>
  );
}
