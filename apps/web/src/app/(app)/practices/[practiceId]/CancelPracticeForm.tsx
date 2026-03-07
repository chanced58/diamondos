'use client';
import type { JSX } from 'react';

import { useFormState, useFormStatus } from 'react-dom';
import { cancelPracticeAction } from './actions';

function CancelButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="text-sm text-red-600 hover:text-red-800 underline disabled:opacity-50"
      onClick={(e) => {
        if (!confirm('Cancel this practice?')) e.preventDefault();
      }}
    >
      {pending ? 'Cancelling...' : 'Cancel practice'}
    </button>
  );
}

export function CancelPracticeForm({ practiceId }: { practiceId: string }): JSX.Element | null {
  const [error, formAction] = useFormState(cancelPracticeAction, null);

  return (
    <form action={formAction} className="flex flex-col items-end gap-2">
      <input type="hidden" name="practiceId" value={practiceId} />
      <label className="flex items-center gap-1.5 cursor-pointer select-none">
        <input
          type="checkbox"
          name="notifyTeam"
          defaultChecked
          className="rounded border-red-300 text-red-600 focus:ring-red-400"
        />
        <span className="text-xs text-red-600">Notify team</span>
      </label>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <CancelButton />
    </form>
  );
}
