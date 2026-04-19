import type { JSX } from 'react';
import type { DemoPlayer } from '../mock-data';

interface Props {
  player: DemoPlayer;
}

export function AcademicsCard({ player }: Props): JSX.Element {
  const tiles = [
    { label: 'GPA', value: `${player.gpa.toFixed(2)} / ${player.gpaScale.toFixed(1)}` },
    { label: 'Weighted GPA', value: player.weightedGpa.toFixed(2) },
    { label: 'SAT', value: player.satScore.toString() },
    { label: 'ACT', value: player.actScore.toString() },
    { label: 'Class rank', value: player.classRank },
  ];

  return (
    <section className="bg-white border border-gray-200 rounded-xl p-6">
      <h2 className="text-base font-semibold text-gray-900 mb-4">Academics</h2>

      <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
        {tiles.map(({ label, value }) => (
          <div
            key={label}
            className="bg-gray-50 border border-gray-100 rounded-lg px-3 py-3 text-center"
          >
            <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-0.5">{label}</p>
            <p className="text-base font-bold text-gray-900 tabular-nums">{value}</p>
          </div>
        ))}
      </div>

      {player.apCourses.length > 0 && (
        <div className="mt-6">
          <p className="text-xs uppercase tracking-wide text-gray-500 font-semibold mb-2">
            AP &amp; Honors coursework
          </p>
          <div className="flex flex-wrap gap-2">
            {player.apCourses.map((c) => (
              <span
                key={c}
                className="text-xs bg-gray-100 text-gray-700 border border-gray-200 px-2.5 py-1 rounded-full"
              >
                {c}
              </span>
            ))}
          </div>
        </div>
      )}

      {player.academicAwards.length > 0 && (
        <div className="mt-5">
          <p className="text-xs uppercase tracking-wide text-gray-500 font-semibold mb-2">
            Academic awards
          </p>
          <ul className="space-y-1.5">
            {player.academicAwards.map((a, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-800">
                <span className="text-brand-700 mt-0.5">▸</span>
                <span>{a}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-5 text-xs text-gray-400">
        Academic block is shared with verified college recruiters only — hidden from public links.
      </p>
    </section>
  );
}
