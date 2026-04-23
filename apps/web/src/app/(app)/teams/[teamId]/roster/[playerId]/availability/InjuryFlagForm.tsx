'use client';
import { useFormState, useFormStatus } from 'react-dom';
import type { JSX } from 'react';
import { addInjuryFlagAction } from './actions';
import { localDateYmd } from '@/lib/local-date';

type CatalogRow = {
  slug: string;
  name: string;
  body_part: string;
  visibility: 'system' | 'team';
};

export function InjuryFlagForm({
  teamId,
  playerId,
  catalog,
}: {
  teamId: string;
  playerId: string;
  catalog: CatalogRow[];
}): JSX.Element {
  const [error, formAction] = useFormState(addInjuryFlagAction, null);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="teamId" value={teamId} />
      <input type="hidden" name="playerId" value={playerId} />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <label className="block md:col-span-1">
          <span className="text-xs font-medium text-gray-700">Injury</span>
          <select
            name="injurySlug"
            required
            className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
          >
            <option value="">Select…</option>
            {catalog.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name} ({c.body_part.replace('_', ' ')})
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-xs font-medium text-gray-700">Start date</span>
          <input
            name="effectiveFrom"
            type="date"
            defaultValue={localDateYmd()}
            required
            className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium text-gray-700">End date (optional)</span>
          <input
            name="effectiveTo"
            type="date"
            className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
          />
        </label>
      </div>

      <label className="block">
        <span className="text-xs font-medium text-gray-700">Notes (optional)</span>
        <textarea
          name="notes"
          rows={2}
          maxLength={500}
          placeholder="Context for the coaching staff — not visible to parents/players."
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
      {pending ? 'Adding…' : 'Add flag'}
    </button>
  );
}
