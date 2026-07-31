'use client';
import type { JSX } from 'react';

import { useState, useTransition } from 'react';
import type { GameRsvpStatus } from '@baseball/shared';
import { rsvpToGameAction } from './actions';

const OPTIONS: { status: GameRsvpStatus; label: string; activeClass: string }[] = [
  { status: 'attending', label: 'Going', activeClass: 'bg-green-600 text-white border-green-600' },
  { status: 'maybe', label: 'Maybe', activeClass: 'bg-amber-500 text-white border-amber-500' },
  { status: 'not_attending', label: "Can't go", activeClass: 'bg-gray-700 text-white border-gray-700' },
];

const inactiveClass = 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50';

type RsvpPlayer = {
  playerId: string;
  playerName: string;
  status: GameRsvpStatus | null;
};

function PlayerRow({
  gameId,
  player,
}: {
  gameId: string;
  player: RsvpPlayer;
}): JSX.Element {
  const [status, setStatus] = useState<GameRsvpStatus | null>(player.status);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [, startTransition] = useTransition();

  function choose(next: GameRsvpStatus) {
    if (saving) return;
    const previous = status;
    setStatus(next);
    setError(null);
    setSaving(true);
    // startTransition's callback must be synchronous (return void, not a
    // Promise) — wrap the async work in a fire-and-forget IIFE instead of
    // passing an async function directly.
    startTransition(() => {
      void (async () => {
        const result = await rsvpToGameAction({ gameId, playerId: player.playerId, status: next });
        if (result.error) {
          setStatus(previous);
          setError(result.error);
        }
        setSaving(false);
      })();
    });
  }

  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <span className="text-sm font-medium text-gray-900">{player.playerName}</span>
      <div className="flex gap-1.5">
        {OPTIONS.map((opt) => (
          <button
            key={opt.status}
            type="button"
            aria-pressed={status === opt.status}
            disabled={saving}
            onClick={() => choose(opt.status)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors disabled:opacity-50 ${
              status === opt.status ? opt.activeClass : inactiveClass
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}

export function RsvpButtons({
  gameId,
  players,
}: {
  gameId: string;
  players: RsvpPlayer[];
}): JSX.Element {
  return (
    <div className="bg-white rounded-xl border border-gray-200 px-5 py-3 mb-6">
      <h2 className="text-sm font-semibold text-gray-700 mb-1">
        {players.length > 1 ? 'Are they going?' : 'Are you going?'}
      </h2>
      <div className="divide-y divide-gray-100">
        {players.map((player) => (
          <PlayerRow key={player.playerId} gameId={gameId} player={player} />
        ))}
      </div>
    </div>
  );
}
