export function FilterBar({
  teams,
  teamId,
  onTeamId,
  query,
  onQuery,
  qualifiedOnly,
  onQualifiedOnly,
  showQualified,
}: {
  teams: Array<{ teamId: string; name: string }>;
  teamId: string | 'all';
  onTeamId: (teamId: string | 'all') => void;
  query: string;
  onQuery: (query: string) => void;
  qualifiedOnly: boolean;
  onQualifiedOnly: (on: boolean) => void;
  /** Hidden when the league doesn't rank its players. */
  showQualified: boolean;
}): JSX.Element {
  const field = 'rounded-lg border border-app-border bg-app-surface px-2.5 py-1.5 text-sm text-app-fg';
  return (
    <div className="flex flex-wrap items-center gap-3">
      <label className="flex items-center gap-2 text-sm text-app-fg-muted">
        Team
        <select aria-label="Team" value={teamId} onChange={(e) => onTeamId(e.target.value)} className={field}>
          <option value="all">All teams</option>
          {teams.map((t) => (
            <option key={t.teamId} value={t.teamId}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      <input
        type="search"
        aria-label="Search players"
        placeholder="Search players"
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        className={`${field} min-w-0 flex-1 sm:max-w-xs`}
      />
      {showQualified ? (
        <button
          type="button"
          role="switch"
          aria-checked={qualifiedOnly}
          onClick={() => onQualifiedOnly(!qualifiedOnly)}
          className="inline-flex items-center gap-2 rounded-lg text-sm font-medium text-app-fg-muted hover:text-app-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-fg/40"
        >
          <span
            aria-hidden
            className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${
              qualifiedOnly ? 'bg-turf-600' : 'bg-app-surface-2 ring-1 ring-inset ring-app-border'
            }`}
          >
            <span
              className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                qualifiedOnly ? 'translate-x-[1.125rem]' : 'translate-x-0.5'
              }`}
            />
          </span>
          Qualified only
        </button>
      ) : null}
    </div>
  );
}
