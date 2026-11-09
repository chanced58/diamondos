import { leagueStatsHref } from '@/lib/league-home/stats-href';
import type { StatsTab } from '@/lib/league-stats/columns';

/**
 * Season links for the stats page. Rendered by the client view so each link keeps
 * the *current* tab (tab changes only rewrite the URL via history.replaceState).
 * Hidden when there is only one season.
 */
export function SeasonSwitcher({
  slug,
  season,
  seasons,
  tab,
}: {
  slug: string;
  season: string;
  seasons: string[];
  tab: StatsTab;
}): JSX.Element | null {
  if (seasons.length <= 1) return null;
  return (
    <nav aria-label="Season" className="inline-flex rounded-lg border border-app-border bg-app-surface-2 p-0.5 text-sm">
      {seasons.map((s) => (
        <a
          key={s}
          href={leagueStatsHref(slug, s, tab)}
          aria-current={s === season ? 'true' : undefined}
          className={`rounded-md px-2.5 py-1 font-semibold transition-colors ${
            s === season ? 'bg-app-surface text-app-fg shadow-sm' : 'text-app-fg-muted hover:text-app-fg'
          }`}
        >
          {s}
        </a>
      ))}
    </nav>
  );
}
