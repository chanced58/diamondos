import type { HotHitter } from '@baseball/shared';

interface PlayerLookup {
  [playerId: string]: { firstName: string; lastName: string; jerseyNumber?: number | null };
}

interface Props {
  hotHitters: HotHitter[];
  coldHitters: HotHitter[];
  players: PlayerLookup;
  totalReps: number;
}

export function HotHittersPanel({ hotHitters, coldHitters, players, totalReps }: Props): JSX.Element | null {
  if (totalReps === 0) return null;

  return (
    <section className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-900">Recent BP performance</h3>
        <span className="text-xs text-gray-500">{totalReps} reps logged (last 3 days)</span>
      </div>

      {hotHitters.length === 0 && coldHitters.length === 0 && (
        <p className="text-xs text-gray-500">
          No hitters have enough reps (5+ in the last 3 days) to rank yet. Log more BP reps above.
        </p>
      )}

      {hotHitters.length > 0 && (
        <div className="mb-4">
          <div className="text-xs font-medium text-emerald-700 uppercase tracking-wide mb-1">Hot</div>
          <ol className="space-y-1.5">
            {hotHitters.slice(0, 5).map((h) => {
              const p = players[h.playerId];
              const name = p ? `${p.lastName}, ${p.firstName}` : 'Unknown';
              return (
                <li key={h.playerId} className="flex items-center justify-between gap-3 text-sm">
                  <div>
                    <span className="font-mono text-xs text-gray-400 mr-2">#{h.rank}</span>
                    <span className="text-gray-900 font-medium">{name}</span>
                    {p?.jerseyNumber != null && <span className="ml-2 text-xs text-gray-400">#{p.jerseyNumber}</span>}
                  </div>
                  <div className="text-xs text-gray-600 font-mono">
                    {h.evidence.hitHard + h.evidence.lineDrives}/{h.evidence.totalReps} quality
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {coldHitters.length > 0 && (
        <div>
          <div className="text-xs font-medium text-red-700 uppercase tracking-wide mb-1">Cold</div>
          <ol className="space-y-1.5">
            {coldHitters.slice(0, 3).map((h) => {
              const p = players[h.playerId];
              const name = p ? `${p.lastName}, ${p.firstName}` : 'Unknown';
              return (
                <li key={h.playerId} className="flex items-center justify-between gap-3 text-sm">
                  <div>
                    <span className="text-gray-900 font-medium">{name}</span>
                    {p?.jerseyNumber != null && <span className="ml-2 text-xs text-gray-400">#{p.jerseyNumber}</span>}
                  </div>
                  <div className="text-xs text-gray-600 font-mono">
                    {h.evidence.swingAndMisses + h.evidence.weakContact}/{h.evidence.totalReps} poor
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </section>
  );
}
