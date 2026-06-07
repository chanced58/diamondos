'use client';

import { useState } from 'react';
import type { StatDef } from '@baseball/shared';
import type { LeaderHomeRow } from '@/lib/league-home/load';
import { formatStat, type StatFormat } from '@/lib/league-home/format-stat';
import { teamHref } from '@/lib/league-home/team-href';

const TOP_N = 5;

// Podium gradients for ranks 1–3 (gold / silver / clay). Ranks 4+ use a neutral chip.
const PODIUM: Record<number, string> = {
  1: 'linear-gradient(135deg,#fbbf24,#d97706)',
  2: 'linear-gradient(135deg,#e2e8f0,#94a3b8)',
  3: 'linear-gradient(135deg,var(--clay-400),var(--clay-600))',
};

export function LeaderBoard({
  title,
  rows,
  format,
  sortDir,
  slug,
  season,
}: {
  title: string;
  rows: LeaderHomeRow[];
  format: StatFormat;
  sortDir: StatDef['sortDir'];
  slug: string;
  season: string;
}): JSX.Element {
  const [showAll, setShowAll] = useState(false);
  const ascending = sortDir === 'asc'; // lower is better (ERA, WHIP, Team ERA)

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-app-border bg-app-surface p-4">
        <BoardHeader title={title} ascending={ascending} />
        <p className="mt-2 text-sm text-app-fg-subtle">No qualified leaders yet.</p>
      </div>
    );
  }

  const leaderValue = rows[0].value;
  const visible = showAll ? rows : rows.slice(0, TOP_N);

  return (
    <div className="rounded-xl border border-app-border bg-app-surface p-4">
      <BoardHeader title={title} ascending={ascending} />
      <ol className="mt-2 space-y-0.5">
        {visible.map((r) => (
          <li
            key={r.id}
            className={`relative flex items-center gap-2 overflow-hidden rounded-lg px-2 py-1.5 text-sm ${
              r.ours ? 'bg-turf-50' : ''
            }`}
          >
            {/* relative-value bar */}
            <span
              aria-hidden
              className="lb-fill pointer-events-none absolute inset-y-0 left-0 rounded-lg"
              style={{
                width: `${barPct(r.value, leaderValue, ascending)}%`,
                background: r.ours ? 'rgba(34,197,94,0.16)' : 'var(--brand-100)',
                opacity: r.ours ? 1 : 0.5,
              }}
            />
            <span
              className="relative z-10 grid h-6 w-6 shrink-0 place-items-center rounded-md text-xs font-bold"
              style={
                PODIUM[r.rank]
                  ? { background: PODIUM[r.rank], color: '#fff' }
                  : { background: 'var(--app-surface-2)', color: 'var(--app-fg-muted)' }
              }
            >
              {r.rank}
            </span>
            <span className="relative z-10 min-w-0 flex-1 truncate">
              <span className="font-medium text-app-fg">{r.name}</span>
              {r.ours ? (
                <span
                  aria-label="Your team"
                  title="Your team"
                  className="ml-1 inline-block h-2 w-2 rotate-45 rounded-[1px] bg-turf-600 align-middle"
                />
              ) : null}
              {r.teamName ? (
                r.teamId ? (
                  <a href={teamHref(slug, r.teamId, season)} className="ml-1 text-app-fg-subtle hover:underline">
                    · {r.teamName}
                  </a>
                ) : (
                  <span className="ml-1 text-app-fg-subtle">· {r.teamName}</span>
                )
              ) : null}
            </span>
            <RankDelta prevRank={r.prevRank} rank={r.rank} />
            <span className="relative z-10 mono shrink-0 font-semibold text-app-fg">
              {formatStat(r.value, format)}
            </span>
          </li>
        ))}
      </ol>
      {rows.length > TOP_N ? (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="mt-2 flex w-full items-center justify-center gap-1 rounded-lg py-1.5 text-xs font-semibold text-app-fg-muted transition-colors hover:bg-app-surface-2"
        >
          {showAll ? 'Show less' : `Show all ${rows.length}`}
          <svg
            viewBox="0 0 16 16"
            className={`h-3.5 w-3.5 transition-transform duration-200 ${showAll ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      ) : null}
    </div>
  );
}

function BoardHeader({ title, ascending }: { title: string; ascending: boolean }): JSX.Element {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-app-fg-muted">{title}</h3>
      {ascending ? <span className="text-[10px] font-medium text-app-fg-subtle">Lower = better</span> : null}
    </div>
  );
}

/** ▲n (turf) / ▼n (muted) vs the prior period. Renders nothing when unavailable or flat. */
function RankDelta({ prevRank, rank }: { prevRank: number | null; rank: number }): JSX.Element | null {
  if (prevRank == null) return null;
  const delta = prevRank - rank; // positive = moved up
  if (delta === 0) return null;
  const up = delta > 0;
  return (
    <span
      className={`relative z-10 mono shrink-0 text-[11px] font-semibold ${up ? 'text-turf-700' : 'text-app-fg-subtle'}`}
    >
      {up ? '▲' : '▼'}
      {Math.abs(delta)}
    </span>
  );
}

/**
 * Bar width as a percentage of the board leader. Descending stats scale by
 * value/max; ascending stats (lower is better) invert to min/value. Floored at
 * 12% so last place still shows a sliver.
 */
function barPct(value: number, leaderValue: number, ascending: boolean): number {
  // The leader (and any exact tie, including an all-zero board) gets a full bar
  // before ratio math — otherwise leaderValue===0 would floor everyone to 12%.
  if (value === leaderValue) return 100;
  let ratio: number;
  if (ascending) {
    ratio = value > 0 ? leaderValue / value : 1;
  } else {
    ratio = leaderValue > 0 ? value / leaderValue : 0;
  }
  const clamped = Math.max(0.12, Math.min(1, ratio));
  return Math.round(clamped * 100);
}
