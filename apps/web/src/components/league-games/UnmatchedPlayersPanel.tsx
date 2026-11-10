'use client';

import { useState, type JSX } from 'react';
import { useRouter } from 'next/navigation';
import { resolvePlaceholderAction, type PlaceholderChoice } from '@/app/(app)/games/[gameId]/placeholder-actions';
import type { UnmatchedPlaceholder } from '@/lib/services/league-games/placeholders';

interface UnmatchedPlayersPanelProps {
  placeholders: UnmatchedPlaceholder[];
  /** Active players of each placeholder's team, by team id. */
  rosters: Record<string, { id: string; name: string }[]>;
  /** Show the game under each name (the league-wide list spans games). */
  showGame?: boolean;
}

const BUTTON = 'text-xs font-medium px-2.5 py-1 rounded-md border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-50';
const PRIMARY = 'text-xs font-medium px-2.5 py-1 rounded-md bg-brand-700 text-white hover:bg-brand-600 disabled:opacity-50';
const INPUT = 'text-sm rounded-md border border-gray-200 bg-white px-2 py-1';

function PlaceholderRow({ placeholder, roster, showGame }: { placeholder: UnmatchedPlaceholder; roster: { id: string; name: string }[]; showGame: boolean }): JSX.Element {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState('');
  const [adding, setAdding] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [jersey, setJersey] = useState('');

  function submit(choice: PlaceholderChoice): void {
    setError(null);
    setPending(true);
    resolvePlaceholderAction(placeholder.id, choice)
      .then((message) => {
        if (message) setError(message);
        else router.refresh();
      })
      .catch(() => setError('Something went wrong. Please try again.'))
      .finally(() => setPending(false));
  }

  function submitNewPlayer(): void {
    const jerseyNumber = jersey.trim() === '' ? undefined : Number(jersey);
    if (jerseyNumber !== undefined && !Number.isInteger(jerseyNumber)) {
      setError('Jersey number must be a whole number.');
      return;
    }
    submit({ action: 'create', firstName, lastName, jerseyNumber });
  }

  return (
    <li className="px-4 py-3 space-y-2">
      <div>
        <p className="text-sm font-medium text-gray-900">
          {placeholder.label}
          {placeholder.jerseyNumber ? <span className="text-gray-500"> #{placeholder.jerseyNumber}</span> : null}
          <span className="text-gray-500"> · {placeholder.teamName}</span>
        </p>
        {showGame && <p className="text-xs text-gray-500">{placeholder.gameLabel}</p>}
      </div>

      {placeholder.canResolve ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <select value={playerId} onChange={(e) => setPlayerId(e.target.value)} className={INPUT} aria-label={`Match ${placeholder.label} to a player`}>
              <option value="">Match to a roster player…</option>
              {roster.map((player) => (
                <option key={player.id} value={player.id}>{player.name}</option>
              ))}
            </select>
            <button type="button" disabled={pending || !playerId} onClick={() => submit({ action: 'link', playerId })} className={PRIMARY}>
              Match
            </button>
            <button type="button" disabled={pending} onClick={() => setAdding((open) => !open)} className={BUTTON}>
              Add as new player
            </button>
            <button type="button" disabled={pending} onClick={() => submit({ action: 'fill_in' })} className={BUTTON}>
              Fill-in
            </button>
          </div>

          {adding && (
            <div className="flex flex-wrap items-center gap-2">
              <input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First name" className={INPUT} aria-label="First name" />
              <input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Last name" className={INPUT} aria-label="Last name" />
              <input value={jersey} onChange={(e) => setJersey(e.target.value)} placeholder="Jersey #" inputMode="numeric" className={`${INPUT} w-24`} aria-label="Jersey number" />
              <button type="button" disabled={pending || !firstName.trim() || !lastName.trim()} onClick={submitNewPlayer} className={PRIMARY}>
                Add to roster
              </button>
            </div>
          )}
        </div>
      ) : (
        <p className="text-xs text-gray-500">The other team&apos;s coach or a league admin will match this player.</p>
      )}

      {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
    </li>
  );
}

/**
 * Unknown players the scorer added on the spot, waiting to be matched to a
 * roster player, added to the roster, or marked as a fill-in. Matched players'
 * stats then count for the player.
 */
export function UnmatchedPlayersPanel({ placeholders, rosters, showGame = false }: UnmatchedPlayersPanelProps): JSX.Element | null {
  if (placeholders.length === 0) return null;
  return (
    <section className="bg-white rounded-xl border border-gray-200">
      <div className="px-4 py-3 border-b border-gray-200">
        <h2 className="text-sm font-semibold text-gray-900">Unknown players</h2>
        <p className="text-xs text-gray-500">Match each one so their stats count for the right player.</p>
      </div>
      <ul className="divide-y divide-gray-200">
        {placeholders.map((placeholder) => (
          <PlaceholderRow key={placeholder.id} placeholder={placeholder} roster={rosters[placeholder.teamId] ?? []} showGame={showGame} />
        ))}
      </ul>
    </section>
  );
}
