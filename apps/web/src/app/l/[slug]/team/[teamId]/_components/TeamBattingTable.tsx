import { getStatDef } from '@baseball/shared';
import { formatStat } from '@/lib/league-home/format-stat';
import { getStatValue } from '@/lib/league-home/load';
import { TEAM_BATTING_KEYS, type TeamPlayerStatRow } from '@/lib/league-home/team-load';

export function TeamBattingTable({ players }: { players: TeamPlayerStatRow[] }): JSX.Element {
  if (players.length === 0) {
    return <p className="text-sm text-app-fg-subtle">No players yet for this season.</p>;
  }
  const cols = TEAM_BATTING_KEYS.map((k) => getStatDef(k));
  return (
    <div className="overflow-x-auto rounded-xl border border-app-border bg-app-surface">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-app-border text-left text-xs font-medium uppercase tracking-wider text-app-fg-muted">
            <th className="px-3 py-2.5">Player</th>
            <th className="px-2 py-2.5 text-center">PA</th>
            {cols.map((c) => (
              <th key={c.key} className="px-2 py-2.5 text-center">{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-app-border">
          {players.map((p) => (
            <tr key={p.playerId}>
              <td className="px-3 py-2.5 font-medium text-app-fg">{p.name}</td>
              <td className="mono px-2 py-2.5 text-center">{p.optedOut ? '—' : p.plateAppearances}</td>
              {cols.map((c) => (
                <td key={c.key} className="mono px-2 py-2.5 text-center">
                  {p.optedOut ? '—' : formatStat(getStatValue(p.stats, c.field), c.format)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
