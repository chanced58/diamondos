'use client';
import type { JSX } from 'react';

import { useFormState, useFormStatus } from 'react-dom';
import { deleteEventAction } from './actions';

function DeleteButton({ title }: { title: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="text-sm text-red-600 hover:text-red-800 underline disabled:opacity-50"
      onClick={(e) => {
        if (!confirm(`Delete "${title}"?`)) e.preventDefault();
      }}
    >
      {pending ? 'Deleting...' : 'Delete event'}
    </button>
  );
}

export function DeleteEventForm({ eventId, title }: { eventId: string; title: string }): JSX.Element | null {
  const [error, formAction] = useFormState(deleteEventAction, null);

  return (
    <form action={formAction}>
      <input type="hidden" name="eventId" value={eventId} />
      {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
      <DeleteButton title={title} />
    </form>
  );
}
