import type { RecentGame } from '@/lib/league-home/load';

const RESULT_STYLE: Record<RecentGame['result'], string> = {
  W: 'bg-turf-100 text-turf-800',
  L: 'bg-red-100 text-red-700',
  T: 'bg-app-surface-2 text-app-fg-muted',
};

export function RecentUpcoming({
  recent,
  upcoming,
}: {
  recent: RecentGame[];
  upcoming: Array<{ id: string; label: string }>;
}): JSX.Element {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-app-fg-muted">Recent Results</h3>
        {recent.length ? (
          <ul className="space-y-1">
            {recent.map((g) => (
              <li
                key={g.id}
                className="flex items-center gap-2 rounded-lg border border-app-border bg-app-surface px-3 py-2 text-sm"
              >
                <span
                  className={`grid h-6 w-6 shrink-0 place-items-center rounded-md text-xs font-bold ${RESULT_STYLE[g.result]}`}
                >
                  {g.result}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-medium text-app-fg">{g.team}</span>
                  <span className="text-app-fg-subtle"> vs {g.opponent}</span>
                </span>
                <span className="mono shrink-0 font-semibold text-app-fg">
                  {g.ourScore}–{g.theirScore}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-app-fg-subtle">No results yet.</p>
        )}
      </div>
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-app-fg-muted">Upcoming</h3>
        {upcoming.length ? (
          <ul className="space-y-1">
            {upcoming.map((g) => (
              <li
                key={g.id}
                className="rounded-lg border border-app-border bg-app-surface px-3 py-2 text-sm text-app-fg"
              >
                {g.label}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-app-fg-subtle">Nothing scheduled.</p>
        )}
      </div>
    </div>
  );
}
