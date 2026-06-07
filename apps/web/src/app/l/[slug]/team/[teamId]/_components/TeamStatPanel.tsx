import type { TeamStatItem } from '@/lib/league-home/team-load';

export function TeamStatPanel({ stats }: { stats: TeamStatItem[] }): JSX.Element | null {
  if (stats.length === 0) return null;
  return (
    <section>
      <h2 className="display mb-3 text-xl font-bold">Team Stats</h2>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.key} className="rounded-xl border border-app-border bg-app-surface px-4 py-3">
            <dt className="text-xs font-medium uppercase tracking-wider text-app-fg-muted">{s.label}</dt>
            <dd className="mono mt-1 text-xl font-semibold text-app-fg">{s.display}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
