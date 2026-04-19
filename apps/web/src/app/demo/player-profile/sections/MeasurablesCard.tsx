import type { JSX } from 'react';
import type { DemoPlayer } from '../mock-data';

interface Props {
  player: DemoPlayer;
}

export function MeasurablesCard({ player }: Props): JSX.Element {
  const ft = Math.floor(player.heightInches / 12);
  const inch = player.heightInches % 12;

  const tiles = [
    { label: 'Height', value: `${ft}'${inch}"` },
    { label: 'Weight', value: `${player.weightLbs} lbs` },
    { label: '60-yd', value: `${player.sixtyYardDashSeconds.toFixed(2)}s` },
    { label: 'Exit velo (avg)', value: `${player.exitVelocityMph} mph` },
    { label: 'Top exit velo', value: `${player.maxExitVelocityMph} mph` },
    { label: 'Home → 1B', value: `${player.homeToFirstSeconds.toFixed(2)}s` },
    { label: 'Home → Home', value: `${player.homeToHomeSeconds.toFixed(1)}s` },
  ];

  return (
    <section className="bg-white border border-gray-200 rounded-xl p-6">
      <h2 className="text-base font-semibold text-gray-900 mb-4">Measurables</h2>

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

      {player.pitchTypes.length > 0 && (
        <div className="mt-6 pt-5 border-t border-gray-100">
          <p className="text-xs uppercase tracking-wide text-gray-500 font-semibold mb-3">
            Pitch velocity by type
          </p>
          <div className="overflow-x-auto">
            <table className="table-auto w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
                  <th className="py-2 pr-4 font-semibold">Pitch</th>
                  <th className="py-2 pr-4 font-semibold tabular-nums">Avg MPH</th>
                  <th className="py-2 pr-4 font-semibold tabular-nums">Top MPH</th>
                  <th className="py-2 font-semibold tabular-nums">Spin (RPM)</th>
                </tr>
              </thead>
              <tbody>
                {player.pitchTypes.map((p) => (
                  <tr key={p.pitchType} className="border-b border-gray-50 last:border-0">
                    <td className="py-2 pr-4 text-gray-900">{p.pitchType}</td>
                    <td className="py-2 pr-4 text-gray-900 tabular-nums">{p.avgMph}</td>
                    <td className="py-2 pr-4 text-gray-900 tabular-nums">{p.topMph}</td>
                    <td className="py-2 text-gray-900 tabular-nums">{p.spinRpm.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-gray-400">
            Pitch metrics import directly from Rapsodo and TrackMan sessions on the live product.
          </p>
        </div>
      )}
    </section>
  );
}
