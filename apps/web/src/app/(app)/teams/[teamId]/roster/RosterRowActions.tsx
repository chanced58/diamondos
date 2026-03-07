import type { JSX } from 'react';
'use client';

import { useFormState, useFormStatus } from 'react-dom';
import Link from 'next/link';
import { removePlayerAction } from './actions';

function RemoveButton({ playerName }: { playerName: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="text-red-500 hover:text-red-700 disabled:opacity-50 transition-colors"
      title="Remove from roster"
      onClick={(e) => {
        if (!confirm(`Remove ${playerName} from the roster?`)) e.preventDefault();
      }}
    >
      {pending ? '…' : 'Remove'}
    </button>
  );
}

type Props = {
  teamId: string;
  playerId: string;
  playerName: string;
};

export function RosterRowActions({ teamId, playerId, playerName }: Props): JSX.Element | null {
  const [error, formAction] = useFormState(removePlayerAction, null);

  return (
    <div className="flex items-center gap-3">
      <Link
        href={`/teams/${teamId}/roster/${playerId}`}
        className="text-brand-700 hover:text-brand-800 transition-colors"
      >
        Edit
      </Link>
      <span className="text-gray-200">|</span>
      <form action={formAction} className="inline">
        <input type="hidden" name="teamId" value={teamId} />
        <input type="hidden" name="playerId" value={playerId} />
        {error && <span className="text-xs text-red-600 mr-2">{error}</span>}
        <RemoveButton playerName={playerName} />
      </form>
    </div>
  );
}
