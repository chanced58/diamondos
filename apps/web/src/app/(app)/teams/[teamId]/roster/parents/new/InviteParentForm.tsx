'use client';
import type { JSX } from 'react';

import { useFormState, useFormStatus } from 'react-dom';
import { inviteParentAction } from './actions';

type Player = {
  id: string;
  firstName: string;
  lastName: string;
  jerseyNumber: number | null;
};

const inputClass =
  'w-full border border-gray-300 rounded-lg px-3 py-2.5 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full bg-brand-700 text-white font-semibold py-2.5 rounded-lg hover:bg-brand-800 disabled:opacity-50 transition-colors"
    >
      {pending ? 'Saving...' : 'Add parent'}
    </button>
  );
}

export function InviteParentForm({
  teamId,
  players,
}: {
  teamId: string;
  players: Player[];
}): JSX.Element | null {
  const [result, formAction] = useFormState(inviteParentAction, null);
  const isSuccess = result === 'added' || result === 'invited';

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="teamId" value={teamId} />

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">First name</label>
          <input type="text" name="firstName" className={inputClass} placeholder="Jane" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Last name</label>
          <input type="text" name="lastName" className={inputClass} placeholder="Smith" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input
            type="email"
            name="email"
            className={inputClass}
            placeholder="parent@example.com"
            autoComplete="email"
          />
          <p className="text-xs text-gray-400 mt-1">
            Optional — sends an invite so they can view their player&apos;s practice notes.
          </p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
          <input
            type="tel"
            name="phone"
            className={inputClass}
            placeholder="(555) 000-0000"
          />
        </div>
      </div>

      {players.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Linked players
          </label>
          <div className="space-y-2 border border-gray-200 rounded-lg p-3 max-h-52 overflow-y-auto">
            {players.map((p) => (
              <label key={p.id} className="flex items-center gap-2.5 cursor-pointer group">
                <input
                  type="checkbox"
                  name="playerIds"
                  value={p.id}
                  className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                />
                <span className="text-sm text-gray-800 group-hover:text-gray-900">
                  {p.lastName}, {p.firstName}
                  {p.jerseyNumber != null && (
                    <span className="text-gray-400 ml-1.5 font-mono text-xs">
                      #{p.jerseyNumber}
                    </span>
                  )}
                </span>
              </label>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Select the players this parent is associated with. They will be able to view those
            players&apos; practice notes.
          </p>
        </div>
      )}

      {isSuccess && (
        <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
          {result === 'added'
            ? 'Parent added to the team.'
            : 'Invite email sent. They will be added when they accept.'}
        </div>
      )}

      {result && !isSuccess && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {result}
        </p>
      )}

      <SubmitButton />
    </form>
  );
}
