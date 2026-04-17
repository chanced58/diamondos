'use client';
import type { JSX } from 'react';

import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { reactivatePlayerAction } from './actions';

function ReactivateButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="text-xs font-medium text-brand-700 hover:text-brand-800 disabled:opacity-50 transition-colors"
    >
      {pending ? 'Reactivating...' : label}
    </button>
  );
}

type ReactivateFormProps = {
  playerId: string;
  teamId: string;
  /** When true the form is always visible; when false a toggle button is shown first. */
  initialShow?: boolean;
  /** Extra className applied to the wrapper. */
  className?: string;
};

export function ReactivateForm({
  playerId,
  teamId,
  initialShow = false,
  className,
}: ReactivateFormProps): JSX.Element | null {
  const [error, formAction] = useFormState(reactivatePlayerAction, null);
  const [jerseyNumber, setJerseyNumber] = useState('');
  const [showForm, setShowForm] = useState(initialShow);

  if (!showForm) {
    return (
      <button
        onClick={() => setShowForm(true)}
        className="text-xs font-medium text-brand-700 hover:text-brand-800 transition-colors"
      >
        Reactivate
      </button>
    );
  }

  return (
    <form action={formAction} className={className ?? 'flex items-center gap-2'}>
      <input type="hidden" name="teamId" value={teamId} />
      <input type="hidden" name="playerId" value={playerId} />
      <input
        type="number"
        name="jerseyNumber"
        min={0}
        max={99}
        placeholder="Jersey #"
        value={jerseyNumber}
        onChange={(e) => setJerseyNumber(e.target.value)}
        className="w-20 border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-brand-500"
      />
      <ReactivateButton label="Reactivate" />
      {!initialShow && (
        <button
          type="button"
          onClick={() => setShowForm(false)}
          className="text-xs text-gray-400 hover:text-gray-600"
        >
          Cancel
        </button>
      )}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </form>
  );
}
