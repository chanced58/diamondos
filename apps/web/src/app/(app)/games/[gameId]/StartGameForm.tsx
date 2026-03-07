'use client';
import type { JSX } from 'react';

import { useFormState, useFormStatus } from 'react-dom';
import { startGameAction } from './actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="text-sm bg-brand-700 text-white hover:bg-brand-800 disabled:opacity-50 px-4 py-2 rounded-lg font-medium transition-colors"
    >
      {pending ? 'Starting…' : 'Start Game'}
    </button>
  );
}

export function StartGameForm({ gameId }: { gameId: string }): JSX.Element | null {
  const [error, action] = useFormState(startGameAction, null);
  return (
    <form action={action}>
      <input type="hidden" name="gameId" value={gameId} />
      {error && (
        <p className="text-xs text-red-600 mb-2">{error}</p>
      )}
      <SubmitButton />
    </form>
  );
}
