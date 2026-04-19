import type { JSX } from 'react';
import type { BattingLine, DemoPlayer, PitchingLine } from '../mock-data';

interface Props {
  player: DemoPlayer;
}

export function CareerStats({ player }: Props): JSX.Element {
  return (
    <section className="bg-white border border-gray-200 rounded-xl p-6">
      <h2 className="text-base font-semibold text-gray-900 mb-4">Career stats</h2>

      <div className="space-y-8">
        <div>
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
            Career totals
          </h3>
          <div className="space-y-4">
            <BattingGrid stats={player.careerBatting} />
            <PitchingGrid stats={player.careerPitching} />
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
            By season
          </h3>
          <div className="space-y-6">
            {player.seasons.map((s) => (
              <div key={s.key} className="bg-white border border-gray-200 rounded-xl p-4">
                <div className="flex justify-between items-baseline mb-3">
                  <p className="text-sm font-semibold text-gray-900">{s.teamName}</p>
                  <p className="text-xs text-gray-500">{s.seasonName}</p>
                </div>
                {s.batting && <BattingGrid stats={s.batting} />}
                {s.pitching && (
                  <div className="mt-3">
                    <PitchingGrid stats={s.pitching} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function BattingGrid({ stats }: { stats: BattingLine }): JSX.Element {
  const cells: { label: string; value: string }[] = [
    { label: 'AVG', value: stats.avg },
    { label: 'OBP', value: stats.obp },
    { label: 'SLG', value: stats.slg },
    { label: 'OPS', value: stats.ops },
    { label: 'G', value: stats.games.toString() },
    { label: 'PA', value: stats.pa.toString() },
    { label: 'AB', value: stats.ab.toString() },
    { label: 'H', value: stats.hits.toString() },
    { label: '2B', value: stats.doubles.toString() },
    { label: '3B', value: stats.triples.toString() },
    { label: 'HR', value: stats.hr.toString() },
    { label: 'RBI', value: stats.rbi.toString() },
    { label: 'BB', value: stats.bb.toString() },
    { label: 'K', value: stats.k.toString() },
    { label: 'SB', value: stats.sb.toString() },
  ];
  return (
    <div className="grid grid-cols-4 md:grid-cols-6 gap-2">
      {cells.map(({ label, value }) => (
        <div key={label} className="bg-white border border-gray-200 rounded-lg p-2 text-center">
          <p className="text-[10px] text-gray-400 mb-0.5 uppercase tracking-wide">{label}</p>
          <p className="text-sm font-bold text-gray-900 tabular-nums">{value}</p>
        </div>
      ))}
    </div>
  );
}

function PitchingGrid({ stats }: { stats: PitchingLine }): JSX.Element {
  const cells: { label: string; value: string }[] = [
    { label: 'IP', value: stats.ip },
    { label: 'ERA', value: stats.era },
    { label: 'WHIP', value: stats.whip },
    { label: 'K', value: stats.k.toString() },
    { label: 'BB', value: stats.bb.toString() },
    { label: 'H', value: stats.h.toString() },
    { label: 'PC', value: stats.pc.toString() },
    { label: 'STR%', value: stats.strikePct },
  ];
  return (
    <div className="grid grid-cols-4 md:grid-cols-6 gap-2">
      {cells.map(({ label, value }) => (
        <div key={label} className="bg-white border border-gray-200 rounded-lg p-2 text-center">
          <p className="text-[10px] text-gray-400 mb-0.5 uppercase tracking-wide">{label}</p>
          <p className="text-sm font-bold text-gray-900 tabular-nums">{value}</p>
        </div>
      ))}
    </div>
  );
}
