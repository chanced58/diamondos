'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { cancelGameAction } from './actions';

function CancelButton({ gameName }: { gameName: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="text-sm text-red-600 hover:text-red-800 underline disabled:opacity-50"
      onClick={(e) => {
        if (!confirm(`Cancel the game against ${gameName}?`)) e.preventDefault();
      }}
    >
      {pending ? 'Cancelling...' : 'Cancel game'}
    </button>
  );
}

export function CancelGameForm({
  gameId,
  opponentName,
  currentStatus,
}: {
  gameId: string;
  opponentName: string;
  currentStatus: string;
}) {
  const [error, formAction] = useFormState(cancelGameAction, null);

  if (currentStatus === 'cancelled' || currentStatus === 'completed') {
    return (
      <p className="text-xs text-gray-400 italic">
        Game is already {currentStatus}.
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col items-end gap-2">
      <input type="hidden" name="gameId" value={gameId} />
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
      <CancelButton gameName={opponentName} />
    </form>
  );
}
