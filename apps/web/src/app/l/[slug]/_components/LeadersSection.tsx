'use client';

import { useEffect, useState } from 'react';
import type { LeaderBoardResult } from '@/lib/league-home/load';
import { LeaderBoard } from './LeaderBoard';

type Cat = 'batting' | 'pitching' | 'team' | 'special';

const TABS: Array<{ id: Cat; label: string }> = [
  { id: 'batting', label: 'Batting' },
  { id: 'pitching', label: 'Pitching' },
  { id: 'team', label: 'Team' },
  { id: 'special', label: 'Special' },
];

export function LeadersSection({
  boards,
}: {
  boards: Record<Cat, LeaderBoardResult[]>;
}): JSX.Element {
  // Only offer tabs that actually have boards; default to the first available.
  const available = TABS.filter((t) => boards[t.id].length > 0);
  const [active, setActive] = useState<Cat>(available[0]?.id ?? 'batting');

  // If the active tab disappears (e.g. a season change drops a category), fall
  // back to the first available tab instead of showing an empty state.
  useEffect(() => {
    if (available.length > 0 && !available.some((t) => t.id === active)) {
      setActive(available[0].id);
    }
  }, [active, available]);

  const activeBoards = boards[active] ?? [];

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="display text-xl font-bold">League Leaders</h2>
        {available.length > 1 ? (
          <div
            role="tablist"
            aria-label="Leaderboard category"
            className="inline-flex rounded-lg border border-app-border bg-app-surface-2 p-0.5 text-sm"
          >
            {available.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active === t.id}
                onClick={() => setActive(t.id)}
                className={`rounded-md px-3 py-1 font-semibold transition-colors ${
                  active === t.id
                    ? 'bg-app-surface text-app-fg shadow-sm'
                    : 'text-app-fg-muted hover:text-app-fg'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {activeBoards.length === 0 ? (
        <p className="text-sm text-app-fg-subtle">No qualified leaders yet.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {activeBoards.map((b, i) => (
            <LeaderBoard
              key={`${b.def.key}-${i}`}
              title={b.label}
              rows={b.rows}
              format={b.def.format}
              sortDir={b.def.sortDir}
            />
          ))}
        </div>
      )}
    </section>
  );
}
