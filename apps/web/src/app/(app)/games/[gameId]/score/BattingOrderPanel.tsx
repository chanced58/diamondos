'use client';

import { useState } from 'react';
import type { JSX } from 'react';

export type BattingOrderPlayer = {
  playerId: string;
  battingOrder: number;
  name: string;
  jerseyNumber: number | string | null;
  position: string | null;
};

export function BattingOrderPanel({
  players,
  activePlayerId,
  teamName,
  className = '',
}: {
  players: BattingOrderPlayer[];
  activePlayerId: string | null;
  teamName: string;
  className?: string;
}): JSX.Element {
  const [showFullLineup, setShowFullLineup] = useState(false);
  const activeIndex = players.findIndex(
    (player) => player.playerId === activePlayerId,
  );
  const orderedPlayers =
    activeIndex > 0
      ? [...players.slice(activeIndex), ...players.slice(0, activeIndex)]
      : players;

  return (
    <aside className={`xl:sticky xl:top-4 ${className}`}>
      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto">
        <header className="flex items-center justify-between gap-3 bg-brand-900 px-4 py-3 text-white">
          <div>
            <h2 className="text-sm font-semibold">Batting order</h2>
            <p className="mt-0.5 text-xs text-blue-200">{teamName}</p>
          </div>
          {activeIndex >= 0 && (
            <span className="shrink-0 rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium text-blue-100">
              {activeIndex + 1} of {players.length}
            </span>
          )}
        </header>

        {orderedPlayers.length > 0 ? (
          <ol
            aria-label={`${teamName} batting order`}
            className="divide-y divide-gray-100"
          >
            {orderedPlayers.map((player, index) => {
              const isAtBat = player.playerId === activePlayerId;
              const isOnDeck = activeIndex >= 0 && index === 1;
              const isHiddenOnSmallScreen = !showFullLineup && index >= 3;

              return (
                <li
                  key={player.playerId}
                  className={`items-center gap-3 px-4 py-3 ${
                    isHiddenOnSmallScreen ? 'hidden xl:flex' : 'flex'
                  } ${isAtBat ? 'bg-brand-50' : ''}`}
                >
                  <span
                    className={`flex w-8 shrink-0 flex-col items-center text-xs font-semibold leading-tight ${isAtBat ? 'text-brand-700' : 'text-gray-400'}`}
                  >
                    {player.battingOrder}
                    {player.position && (
                      <span className="mt-0.5 text-[9px] font-medium text-gray-400">
                        {player.position}
                      </span>
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p
                      className={`truncate text-sm ${isAtBat ? 'font-semibold text-brand-900' : 'font-medium text-gray-800'}`}
                    >
                      {player.name}
                      {player.jerseyNumber != null && (
                        <span className="ml-1.5 font-normal text-gray-500">
                          #{player.jerseyNumber}
                        </span>
                      )}
                    </p>
                  </div>
                  {isAtBat ? (
                    <span className="shrink-0 rounded-full bg-brand-700 px-2 py-0.5 text-[10px] font-semibold text-white">
                      At bat
                    </span>
                  ) : isOnDeck ? (
                    <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">
                      On deck
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="px-4 py-5 text-sm text-gray-500">
            No batting order has been added.
          </p>
        )}

        {orderedPlayers.length > 3 && (
          <button
            type="button"
            aria-expanded={showFullLineup}
            onClick={() => setShowFullLineup((expanded) => !expanded)}
            className="w-full border-t border-gray-100 px-4 py-3 text-left text-xs font-semibold text-brand-700 hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand-600 xl:hidden"
          >
            {showFullLineup
              ? 'Show less'
              : `Show full lineup (${orderedPlayers.length})`}
          </button>
        )}
      </section>
    </aside>
  );
}
