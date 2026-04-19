import type { JSX } from 'react';
import type { DemoPlayer } from '../mock-data';

interface Props {
  player: DemoPlayer;
}

export function StrengthsSummary({ player }: Props): JSX.Element {
  return (
    <section className="bg-white border border-gray-200 rounded-xl p-6">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="text-base font-semibold text-gray-900">Strengths &amp; attributes</h2>
        <span className="text-[10px] uppercase tracking-wide bg-brand-50 text-brand-700 border border-brand-200 px-2 py-0.5 rounded-full font-semibold">
          AI summary · beta
        </span>
      </div>

      <p className="text-sm text-gray-800 leading-relaxed">{player.strengthsSummary}</p>

      <div className="mt-5 flex flex-wrap gap-2">
        {player.strengthsTags.map((tag) => (
          <span
            key={tag}
            className="text-xs bg-brand-50 text-brand-700 border border-brand-200 px-2.5 py-1 rounded-full"
          >
            {tag}
          </span>
        ))}
      </div>

      <p className="mt-5 text-xs text-gray-400">
        Generated from a player&apos;s on-field stats plus coach-entered character notes. Refreshed each season.
      </p>
    </section>
  );
}
