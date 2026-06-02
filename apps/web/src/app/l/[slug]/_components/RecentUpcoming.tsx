export function RecentUpcoming({
  recent,
  upcoming,
}: {
  recent: Array<{ id: string; label: string }>;
  upcoming: Array<{ id: string; label: string }>;
}): JSX.Element {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div>
        <h3 className="mb-2 text-sm font-semibold uppercase text-slate-500">Recent Results</h3>
        {recent.length ? (
          <ul className="space-y-1">
            {recent.map((g) => (
              <li key={g.id} className="text-sm">
                {g.label}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-400">No results yet.</p>
        )}
      </div>
      <div>
        <h3 className="mb-2 text-sm font-semibold uppercase text-slate-500">Upcoming</h3>
        {upcoming.length ? (
          <ul className="space-y-1">
            {upcoming.map((g) => (
              <li key={g.id} className="text-sm">
                {g.label}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-400">Nothing scheduled.</p>
        )}
      </div>
    </div>
  );
}
