import type { TeamRecord } from '@/lib/league-home/team-load';

export function TeamHero({
  slug,
  season,
  leagueName,
  team,
  record,
  rank,
  divisionName,
}: {
  slug: string;
  season: string;
  leagueName: string;
  team: { id: string; name: string; logoUrl: string | null };
  record: TeamRecord;
  rank: { rank: number | null; total: number };
  divisionName: string | null;
}): JSX.Element {
  const diff = record.runsFor - record.runsAgainst;
  const ordinal = rank.rank ? ordinalSuffix(rank.rank) : null;
  return (
    <section className="rounded-2xl border border-app-border bg-app-surface p-5">
      <a
        href={`/l/${slug}?season=${encodeURIComponent(season)}`}
        className="text-sm font-medium text-app-fg-muted hover:text-app-fg"
      >
        ← {leagueName}
      </a>
      <div className="mt-3 flex items-center gap-4">
        {team.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={team.logoUrl} alt="" className="h-14 w-14 rounded-lg object-contain" />
        ) : null}
        <div>
          <h1 className="display text-2xl font-bold text-app-fg">{team.name}</h1>
          <p className="text-sm text-app-fg-muted">
            {season}
            {divisionName ? ` · ${divisionName}` : ''}
            {ordinal ? ` · ${ordinal} of ${rank.total}` : ''}
          </p>
        </div>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Record" value={`${record.wins}-${record.losses}-${record.ties}`} />
        <Stat label="PCT" value={record.winPct.toFixed(3).replace(/^0/, '')} />
        <Stat label="RF / RA" value={`${record.runsFor} / ${record.runsAgainst}`} />
        <Stat label="Run Diff" value={diff > 0 ? `+${diff}` : String(diff)} />
      </dl>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="rounded-lg border border-app-border bg-app-surface-2 px-3 py-2">
      <dt className="text-xs font-medium uppercase tracking-wider text-app-fg-muted">{label}</dt>
      <dd className="mono mt-0.5 text-lg font-semibold text-app-fg">{value}</dd>
    </div>
  );
}

function ordinalSuffix(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}
