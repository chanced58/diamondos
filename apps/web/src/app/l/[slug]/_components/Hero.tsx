export function Hero({
  name,
  logoUrl,
  theme,
  counters,
}: {
  name: string;
  logoUrl: string | null;
  theme: { accentColor: string; bannerUrl: string | null; heroTitle: string; heroTagline: string };
  counters: { teams: number; games: number; season: string };
}): JSX.Element {
  return (
    <header
      className="rounded-xl p-8 text-white shadow"
      style={{ background: theme.bannerUrl ? `url(${theme.bannerUrl}) center/cover` : theme.accentColor }}
    >
      <div className="flex items-center gap-4">
        {logoUrl ? (
          <img src={logoUrl} alt="" className="h-16 w-16 rounded-full bg-white/20 object-cover" />
        ) : null}
        <div>
          <h1 className="text-3xl font-bold drop-shadow">{theme.heroTitle || name}</h1>
          {theme.heroTagline ? <p className="opacity-90 drop-shadow">{theme.heroTagline}</p> : null}
        </div>
      </div>
      <div className="mt-4 flex gap-6 text-sm opacity-90">
        <span>{counters.teams} teams</span>
        <span>{counters.games} games</span>
        <span>{counters.season || '—'}</span>
      </div>
    </header>
  );
}
