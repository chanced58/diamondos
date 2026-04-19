import type { JSX } from 'react';
import type { CharacterHighlight, DemoPlayer } from '../mock-data';

interface Props {
  player: DemoPlayer;
}

const TAG_STYLES: Record<CharacterHighlight['tag'], string> = {
  Sportsmanship: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'Team-first': 'bg-amber-50 text-amber-700 border-amber-200',
  Community: 'bg-sky-50 text-sky-700 border-sky-200',
};

export function CharacterCard({ player }: Props): JSX.Element {
  return (
    <section className="bg-white border border-gray-200 rounded-xl p-6">
      <h2 className="text-base font-semibold text-gray-900 mb-1">Character &amp; sportsmanship</h2>
      <p className="text-xs text-gray-500 mb-5">
        Coach-submitted moments — the kind of things stat lines don&apos;t capture.
      </p>

      <ul className="space-y-5">
        {player.characterHighlights.map((h, i) => (
          <li key={i} className="border-l-2 border-brand-100 pl-4">
            <div className="flex items-start justify-between gap-3 mb-2">
              <span
                className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full border font-semibold ${TAG_STYLES[h.tag]}`}
              >
                {h.tag}
              </span>
              <p className="text-xs text-gray-400 shrink-0">{h.date}</p>
            </div>
            <blockquote className="text-sm text-gray-800 italic leading-relaxed">
              &ldquo;{h.quote}&rdquo;
            </blockquote>
            <p className="mt-2 text-xs text-gray-500">
              — {h.coachName}, {h.teamName}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
