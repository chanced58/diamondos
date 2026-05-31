export function Spotlights({
  items,
}: {
  items: Array<{ type: string; subject_name: string; team_name: string | null; blurb: string }>;
}): JSX.Element | null {
  if (!items.length) return null;
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {items.map((s) => (
        <div key={s.type} className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-xs font-semibold uppercase text-amber-600">
            {s.type === 'player_of_week' ? 'Player of the Week' : 'Hot Team'}
          </p>
          <p className="text-lg font-bold">{s.subject_name}</p>
          {s.team_name ? <p className="text-sm text-slate-500">{s.team_name}</p> : null}
          <p className="text-sm">{s.blurb}</p>
        </div>
      ))}
    </div>
  );
}
