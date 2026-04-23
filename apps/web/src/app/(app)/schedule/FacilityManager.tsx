'use client';
import { useFormState, useFormStatus } from 'react-dom';
import { useState, useTransition } from 'react';
import type { JSX } from 'react';
import { createFacilityAction, deleteFacilityAction } from './actions';

type Facility = {
  id: string;
  name: string;
  kind: string;
  capacity: number | null;
  notes: string | null;
  is_active: boolean;
};

const KIND_OPTIONS: { slug: string; label: string }[] = [
  { slug: 'cage',        label: 'Batting cage' },
  { slug: 'field',       label: 'Field' },
  { slug: 'bullpen',     label: 'Bullpen' },
  { slug: 'gym',         label: 'Gym' },
  { slug: 'classroom',   label: 'Classroom' },
  { slug: 'weight_room', label: 'Weight room' },
  { slug: 'other',       label: 'Other' },
];

const KIND_LABEL: Record<string, string> = Object.fromEntries(
  [
    ['cage', 'Batting cage'],
    ['field', 'Field'],
    ['bullpen', 'Bullpen'],
    ['gym', 'Gym'],
    ['classroom', 'Classroom'],
    ['weight_room', 'Weight room'],
    ['other', 'Other'],
  ],
);

export function FacilityManager({ facilities }: { facilities: Facility[] }): JSX.Element {
  const [error, formAction] = useFormState(createFacilityAction, null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleDelete(id: string, name: string) {
    if (!confirm(`Delete facility "${name}"? This also deletes all of its bookings.`)) return;
    const fd = new FormData();
    fd.append('facilityId', id);
    setDeleteError(null);
    startTransition(() => {
      deleteFacilityAction(null, fd).then((result) => {
        if (result) setDeleteError(result);
      });
    });
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <header className="px-5 py-3 border-b border-gray-200 bg-gray-50">
        <h2 className="text-sm font-semibold text-gray-900">Manage facilities</h2>
      </header>

      <div className="px-5 py-4 border-b border-gray-100">
        <form action={formAction} className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <label className="block md:col-span-2">
            <span className="text-xs font-medium text-gray-700">Name</span>
            <input
              name="name"
              type="text"
              required
              maxLength={80}
              placeholder="Cage 2"
              className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-700">Type</span>
            <select
              name="kind"
              required
              defaultValue="cage"
              className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            >
              {KIND_OPTIONS.map((k) => (
                <option key={k.slug} value={k.slug}>
                  {k.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-700">Capacity (optional)</span>
            <input
              name="capacity"
              type="number"
              min={1}
              max={999}
              className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            />
          </label>
          <label className="block md:col-span-3">
            <span className="text-xs font-medium text-gray-700">Notes (optional)</span>
            <input
              name="notes"
              type="text"
              maxLength={250}
              className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            />
          </label>
          <AddButton />
        </form>
        {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
        {deleteError && <p className="text-sm text-red-600 mt-2">{deleteError}</p>}
      </div>

      {facilities.length === 0 ? (
        <p className="px-5 py-6 text-sm text-gray-500 text-center">
          No facilities yet. Add your first cage or field above.
        </p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {facilities.map((f) => (
            <li key={f.id} className="px-5 py-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">
                  {f.name}
                  <span className="ml-2 text-xs font-normal text-gray-500">
                    ({KIND_LABEL[f.kind] ?? f.kind.replace(/_/g, ' ')})
                  </span>
                  {f.capacity && <span className="ml-2 text-xs text-gray-500">cap {f.capacity}</span>}
                  {!f.is_active && <span className="ml-2 text-xs text-amber-600">inactive</span>}
                </p>
                {f.notes && <p className="text-xs text-gray-500 mt-0.5">{f.notes}</p>}
              </div>
              <button
                type="button"
                disabled={isPending}
                onClick={() => handleDelete(f.id, f.name)}
                className="text-xs text-red-600 hover:text-red-800 disabled:opacity-50"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AddButton(): JSX.Element {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50"
    >
      {pending ? 'Adding…' : 'Add facility'}
    </button>
  );
}
