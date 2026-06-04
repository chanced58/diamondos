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
    return <p className="text-sm text-slate-400">No standings yet for this season.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-50 text-left text-slate-500">
            <th className="px-3 py-2">Team</th>
            <th className="px-2 py-2">W</th>
            <th className="px-2 py-2">L</th>
            <th className="px-2 py-2">T</th>
            <th className="px-2 py-2">PCT</th>
            <th className="px-2 py-2">RF</th>
            <th className="px-2 py-2">RA</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.team_id ?? r.opponent_team_id} className="border-t border-slate-100">
              <td className="px-3 py-2 font-medium">{r.team_name}</td>
              <td className="px-2 py-2">{r.wins}</td>
              <td className="px-2 py-2">{r.losses}</td>
              <td className="px-2 py-2">{r.ties}</td>
              <td className="px-2 py-2">{r.win_pct.toFixed(3).replace(/^0/, '')}</td>
              <td className="px-2 py-2">{r.runs_for}</td>
              <td className="px-2 py-2">{r.runs_against}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
