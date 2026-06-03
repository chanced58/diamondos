'use client';

import { useMemo, useState, type JSX } from 'react';
import Link from 'next/link';
import { BrandMark } from '@/components/ui/BrandMark';
import type { PublicLeagueListItem } from '@/lib/league-home/load';

/** Humanize a league_type / level enum value (e.g. "high_school" -> "High School"). */
function humanize(value: string): string {
  return value
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

const ALL = 'all';

/**
 * Searchable, filterable grid of public leagues for the /leagues directory.
 * Filters in-memory by a name/state-code query and an optional league-type
 * dropdown (options derived from the supplied leagues). Each card links to the
 * league's public home page at /l/[slug].
 */
export function LeagueDirectory({ leagues }: { leagues: PublicLeagueListItem[] }): JSX.Element {
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>(ALL);

  // Distinct league types present in the data, for the filter dropdown.
  const types = useMemo(
    () =>
      Array.from(
        new Set(leagues.map((league) => league.leagueType).filter((leagueType): leagueType is string => !!leagueType)),
      ).sort(),
    [leagues],
  );

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return leagues.filter((league) => {
      const matchesType = typeFilter === ALL || league.leagueType === typeFilter;
      const matchesQuery =
        normalizedQuery === '' ||
        league.name.toLowerCase().includes(normalizedQuery) ||
        (league.stateCode?.toLowerCase().includes(normalizedQuery) ?? false);
      return matchesType && matchesQuery;
    });
  }, [leagues, query, typeFilter]);

  return (
    <div>
      {/* Search + filter controls */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search leagues by name or state…"
          aria-label="Search leagues"
          className="w-full flex-1 rounded-lg border border-app-border bg-app-surface px-4 py-2.5 text-sm text-app-fg placeholder:text-app-fg-subtle focus:border-turf-500 focus:outline-none"
        />
        {types.length > 1 && (
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            aria-label="Filter by league type"
            className="rounded-lg border border-app-border bg-app-surface px-3 py-2.5 text-sm text-app-fg focus:border-turf-500 focus:outline-none"
          >
            <option value={ALL}>All types</option>
            {types.map((leagueType) => (
              <option key={leagueType} value={leagueType}>
                {humanize(leagueType)}
              </option>
            ))}
          </select>
        )}
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-xl border border-app-border bg-app-surface px-4 py-10 text-center text-sm text-app-fg-subtle">
          No leagues match your search.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((league) => (
            <li key={league.slug}>
              <Link
                href={`/l/${league.slug}`}
                className="flex h-full items-center gap-3 rounded-xl border border-app-border bg-app-surface px-4 py-3.5 transition-colors hover:border-turf-500"
              >
                {league.logoUrl ? (
                  <img
                    src={league.logoUrl}
                    alt=""
                    className="h-10 w-10 flex-shrink-0 rounded-lg object-contain"
                  />
                ) : (
                  <BrandMark size={40} />
                )}
                <div className="min-w-0">
                  <div className="truncate font-medium text-app-fg">{league.name}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-app-fg-subtle">
                    {league.stateCode && (
                      <span className="rounded bg-turf-100 px-1.5 py-0.5 font-medium text-turf-700">
                        {league.stateCode}
                      </span>
                    )}
                    {league.leagueType && <span>{humanize(league.leagueType)}</span>}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
