interface StandingRow {
  team_id: string | null;
  opponent_team_id: string | null;
  team_name: string;
  wins: number;
  losses: number;
  ties: number;
  win_pct: number;
  runs_for: number;
  runs_against: number;
}

export function StandingsTable({ rows }: { rows: StandingRow[] }): JSX.Element {
  if (rows.length === 0) {
    return <p className="text-sm text-app-fg-subtle">No standings yet for this season.</p>;
  }
  const maxWins = Math.max(1, ...rows.map((r) => r.wins));
  return (
    <div className="overflow-x-auto rounded-xl border border-app-border bg-app-surface">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-app-border text-left text-xs font-medium uppercase tracking-wider text-app-fg-muted">
            <th className="px-3 py-2.5 text-center">#</th>
            <th className="px-3 py-2.5">Team</th>
            <th className="px-2 py-2.5 text-center">W</th>
            <th className="px-2 py-2.5 text-center">L</th>
            <th className="px-2 py-2.5 text-center">T</th>
            <th className="px-2 py-2.5 text-center">PCT</th>
            <th className="px-2 py-2.5 text-center">RF</th>
            <th className="px-2 py-2.5 text-center">RA</th>
            <th className="px-2 py-2.5 text-center">DIFF</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-app-border">
          {rows.map((r, i) => {
            const diff = r.runs_for - r.runs_against;
            return (
              <tr key={r.team_id ?? r.opponent_team_id}>
                <td className="mono px-3 py-2.5 text-center text-app-fg-subtle">{i + 1}</td>
                <td className="relative px-3 py-2.5 font-medium text-app-fg">
                  <span
                    aria-hidden
                    className="accent-soft-bg absolute inset-y-1 left-0 -z-0 rounded-r"
                    style={{ width: `${Math.round((r.wins / maxWins) * 100)}%`, opacity: 0.5 }}
                  />
                  <span className="relative z-10">{r.team_name}</span>
                </td>
                <td className="mono px-2 py-2.5 text-center">{r.wins}</td>
                <td className="mono px-2 py-2.5 text-center">{r.losses}</td>
                <td className="mono px-2 py-2.5 text-center">{r.ties}</td>
                <td className="mono px-2 py-2.5 text-center font-semibold">
                  {r.win_pct.toFixed(3).replace(/^0/, '')}
                </td>
                <td className="mono px-2 py-2.5 text-center">{r.runs_for}</td>
                <td className="mono px-2 py-2.5 text-center">{r.runs_against}</td>
                <td
                  className={`mono px-2 py-2.5 text-center font-semibold ${
                    diff >= 0 ? 'text-turf-700' : 'text-red-600'
                  }`}
                >
                  {diff > 0 ? `+${diff}` : diff}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
