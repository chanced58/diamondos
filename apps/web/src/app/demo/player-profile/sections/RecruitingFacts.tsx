import type { JSX } from 'react';
import type { DemoPlayer } from '../mock-data';

interface Props {
  player: DemoPlayer;
}

export function RecruitingFacts({ player }: Props): JSX.Element {
  return (
    <section className="bg-white border border-gray-200 rounded-xl p-6 space-y-6">
      <div>
        <h2 className="text-base font-semibold text-gray-900 mb-3">Recruiting</h2>
        <span className="inline-block text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200 px-3 py-1 rounded-full">
          {player.commitmentStatus}
        </span>
      </div>

      <div>
        <p className="text-xs uppercase tracking-wide text-gray-500 font-semibold mb-2">
          Summer / travel teams
        </p>
        <div className="flex flex-wrap gap-2">
          {player.travelTeams.map((t) => (
            <span
              key={t}
              className="text-xs bg-gray-100 text-gray-700 border border-gray-200 px-2.5 py-1 rounded-full"
            >
              {t}
            </span>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs uppercase tracking-wide text-gray-500 font-semibold mb-2">
          Target majors
        </p>
        <div className="flex flex-wrap gap-2">
          {player.targetMajors.map((m) => (
            <span
              key={m}
              className="text-xs bg-brand-50 text-brand-700 border border-brand-200 px-2.5 py-1 rounded-full"
            >
              {m}
            </span>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs uppercase tracking-wide text-gray-500 font-semibold mb-2">
          References
        </p>
        <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg">
          {player.references.map((r) => (
            <li
              key={`${r.name}-${r.role}`}
              className="flex items-center justify-between gap-3 px-3 py-2.5"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{r.name}</p>
                <p className="text-xs text-gray-500 truncate">{r.role}</p>
              </div>
              <span className="text-xs text-gray-400 shrink-0">{r.contact}</span>
            </li>
          ))}
        </ul>
      </div>

      <p className="text-xs text-gray-500 leading-relaxed">
        DiamondOS verifies stats against scored game events, surfaces every coach who&apos;s entered character notes, and lets recruiters request direct contact through the platform.
      </p>
    </section>
  );
}
