'use client';
import type { JSX } from 'react';

import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { EditGameForm } from './EditGameForm';
import { resetGameAction } from './actions';

type GameEditProps = {
  gameId: string;
  opponentName: string;
  scheduledDate: string;   // YYYY-MM-DD
  scheduledTime: string;   // HH:MM
  locationType: string;
  venueName: string;
  notes: string;
};

export function EditGameButton(props: GameEditProps): JSX.Element {
  const [editing, setEditing] = useState(false);

  return (
    <>
      {!editing && (
        <button
          onClick={() => setEditing(true)}
          className="text-sm text-brand-700 border border-brand-200 bg-brand-50 hover:bg-brand-100 px-4 py-2 rounded-lg font-medium transition-colors"
        >
          Edit game
        </button>
      )}

      {editing && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
            <h2 className="text-sm font-semibold text-gray-700">Edit Game</h2>
          </div>
          <div className="px-5 py-5">
            <EditGameForm
              gameId={props.gameId}
              defaultOpponent={props.opponentName}
              defaultDate={props.scheduledDate}
              defaultTime={props.scheduledTime}
              defaultLocationType={props.locationType}
              defaultVenue={props.venueName}
              defaultNotes={props.notes}
              onCancel={() => setEditing(false)}
            />
          </div>
        </div>
      )}
    </>
  );
}

function ResetConfirmButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="shrink-0 text-sm font-medium text-red-700 border border-red-300 bg-red-50 hover:bg-red-100 disabled:opacity-50 px-4 py-2 rounded-lg transition-colors"
    >
      {pending ? 'Resetting...' : 'Reset game'}
    </button>
  );
}

export function ResetGameForm({
  gameId,
}: {
  gameId: string;
}): JSX.Element {
  const [error, formAction] = useFormState(resetGameAction, null);

  return (
    <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4 flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-red-900">Reset this game</p>
        <p className="text-xs text-red-600 mt-0.5">
          Clears all scoring data and returns the game to scheduled status.
        </p>
        {error && <p className="text-xs text-red-700 mt-1 font-medium">{error}</p>}
      </div>
      <form action={formAction}>
        <input type="hidden" name="gameId" value={gameId} />
        <ResetConfirmButton />
      </form>
    </div>
  );
}
