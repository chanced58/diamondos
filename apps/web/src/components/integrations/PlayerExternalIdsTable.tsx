import type { JSX } from 'react';

export interface PlayerExternalIdRow {
  playerName: string;
  jerseyNumber: number | null;
  service: string;
  externalId: string;
  linkedAt: string;
}

interface Props {
  rows: PlayerExternalIdRow[];
}

export function PlayerExternalIdsTable({ rows }: Props): JSX.Element {
  return (
    <section className="bg-white border border-gray-200 rounded-xl p-5">
      <h3 className="font-semibold text-gray-900">Linked player IDs</h3>
      <p className="text-sm text-gray-500 mt-1 mb-4">
        DiamondOS players linked to accounts in external services (Rapsodo, Blast,
        HitTrax, …). These links are populated automatically when you import data from
        those services in a later release.
      </p>

      {rows.length === 0 ? (
        <div className="bg-gray-50 border border-dashed border-gray-200 rounded-lg px-4 py-8 text-center">
          <p className="text-sm text-gray-600 font-medium">No linked IDs yet</p>
          <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">
            Links will appear here after you import a CSV export from a supported
            integration (coming in a later release).
          </p>
        </div>
      ) : (
        <div className="overflow-hidden border border-gray-200 rounded-lg">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Player</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Service</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">External ID</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Linked</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {rows.map((r, i) => (
                <tr key={`${r.service}-${r.externalId}-${i}`}>
                  <td className="px-3 py-2 text-gray-900">
                    {r.playerName}
                    {r.jerseyNumber != null && (
                      <span className="text-gray-500 ml-1">#{r.jerseyNumber}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-gray-700">{r.service}</td>
                  <td className="px-3 py-2 text-gray-600 font-mono text-xs">{r.externalId}</td>
                  <td className="px-3 py-2 text-gray-500 text-xs">
                    {new Date(r.linkedAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
