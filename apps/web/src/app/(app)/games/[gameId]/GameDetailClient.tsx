'use client';
import type { JSX } from 'react';

import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { EditGameForm } from './EditGameForm';
import { resetGameAction, recalculateScoresAction } from './actions';

type OpponentTeamOption = {
  id: string;
  name: string;
  city: string | null;
};

type GameEditProps = {
  gameId: string;
  /** Empty string when opponent is TBD. */
  opponentName: string;
  opponentTeamId: string;
  opponentTeams: OpponentTeamOption[];
  scheduledDate: string;   // YYYY-MM-DD
  scheduledTime: string;   // HH:MM
  locationType: string;
  neutralHomeTeam: string;
  venueName: string;
  notes: string;
};

export function EditGameButton(props: GameEditProps): JSX.Element {
  const [editing, setEditing] = useState(false);
  // Show the TBD-opponent banner only when not actively editing — once the
  // form is open the prompt has already been satisfied.
  const showTbdBanner = !props.opponentName && !editing;

  return (
    <>
      {showTbdBanner && (
        <div className="mb-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-amber-900">Opponent not yet set</p>
            <p className="text-xs text-amber-700">
              This game was scheduled as a TBD slot. Set the opponent once the bracket is decided.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="shrink-0 text-sm font-medium text-amber-900 bg-amber-100 hover:bg-amber-200 border border-amber-300 px-4 py-2 rounded-lg transition-colors"
          >
            Set opponent
          </button>
        </div>
      )}

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
              defaultOpponentTeamId={props.opponentTeamId}
              defaultDate={props.scheduledDate}
              defaultTime={props.scheduledTime}
              defaultLocationType={props.locationType}
              defaultNeutralHomeTeam={props.neutralHomeTeam}
              defaultVenue={props.venueName}
              defaultNotes={props.notes}
              opponentTeams={props.opponentTeams}
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

function RecalculateButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="shrink-0 text-sm font-medium text-amber-700 border border-amber-300 bg-amber-50 hover:bg-amber-100 disabled:opacity-50 px-4 py-2 rounded-lg transition-colors"
    >
      {pending ? 'Recalculating...' : 'Recalculate'}
    </button>
  );
}

export function RecalculateScoresForm({
  gameId,
}: {
  gameId: string;
}): JSX.Element {
  const [error, formAction] = useFormState(recalculateScoresAction, null);

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-amber-900">Recalculate scores</p>
        <p className="text-xs text-amber-700 mt-0.5">
          Re-derives scores from the event log to fix any discrepancies.
        </p>
        {error && <p className="text-xs text-red-700 mt-1 font-medium">{error}</p>}
      </div>
      <form action={formAction}>
        <input type="hidden" name="gameId" value={gameId} />
        <RecalculateButton />
      </form>
    </div>
  );
}
