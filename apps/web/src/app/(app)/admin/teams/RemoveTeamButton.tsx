'use client';
import type { JSX } from 'react';

import { useFormState, useFormStatus } from 'react-dom';
import { removeTeamAction } from './actions';

function SubmitButton({ teamName }: { teamName: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="text-xs text-red-600 hover:text-red-800 disabled:opacity-50 transition-colors"
      onClick={(e) => {
        if (!confirm(`Remove "${teamName}" from the platform?\n\nIf this team has players or game history, it will be converted to an opponent team. Otherwise it will be permanently deleted.`)) {
          e.preventDefault();
        }
      }}
    >
      {pending ? 'Removing...' : 'Remove'}
    </button>
  );
}

type Props = {
  teamId: string;
  teamName: string;
};

export function RemoveTeamButton({ teamId, teamName }: Props): JSX.Element {
  const [error, formAction] = useFormState(removeTeamAction, null);

  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="teamId" value={teamId} />
      {error && <span className="text-xs text-red-600 mr-2">{error}</span>}
      <SubmitButton teamName={teamName} />
    </form>
  );
}
