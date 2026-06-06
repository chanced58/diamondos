export function Hero({
  name,
  logoUrl,
  theme,
  counters,
  seasons,
  activeSeason,
  slug,
  updatedAt,
}: {
  name: string;
  logoUrl: string | null;
  theme: { bannerUrl: string | null; heroTitle: string; heroTagline: string };
  counters: { teams: number; games: number; season: string };
  seasons: string[];
  activeSeason: string;
  slug: string;
  updatedAt: string | null;
}): JSX.Element {
  return (
    <header
      className="relative overflow-hidden rounded-2xl p-8 text-white shadow"
      style={{ background: theme.bannerUrl ? `url(${theme.bannerUrl}) center/cover` : 'var(--app-brand)' }}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          {logoUrl ? (
            <img src={logoUrl} alt="" className="h-16 w-16 rounded-full bg-white/20 object-cover" />
          ) : null}
          <div>
            <h1 className="display text-3xl font-bold drop-shadow">{theme.heroTitle || name}</h1>
            {theme.heroTagline ? <p className="opacity-90 drop-shadow">{theme.heroTagline}</p> : null}
          </div>
        </div>
        {updatedAt ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-turf-400" />
            Updated {timeAgo(updatedAt)}
          </span>
        ) : null}
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
        <div className="mono flex gap-6 text-sm opacity-90">
          <span>
            <strong className="font-semibold">{counters.teams}</strong> teams
          </span>
          <span>
            <strong className="font-semibold">{counters.games}</strong> games
          </span>
          <span>{counters.season || '—'} season</span>
        </div>
        {seasons.length > 1 ? (
          <div className="inline-flex rounded-lg bg-black/20 p-0.5 text-xs backdrop-blur">
            {seasons.map((s) => (
              <a
                key={s}
                href={`/l/${slug}?season=${encodeURIComponent(s)}`}
                aria-current={s === activeSeason ? 'true' : undefined}
                className={`rounded-md px-2.5 py-1 font-semibold transition-colors ${
                  s === activeSeason ? 'bg-white text-app-fg shadow' : 'text-white/80 hover:text-white'
                }`}
              >
                {s}
              </a>
            ))}
          </div>
        ) : null}
      </div>
    </header>
  );
}

/** Compact "N min ago" / "N h ago" / "N d ago" from an ISO timestamp. */
function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 'recently';
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return `${days} d ago`;
}
