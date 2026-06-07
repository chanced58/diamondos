import { teamHref } from '@/lib/league-home/team-href';

export function Spotlights({
  items,
  slug,
  season,
  teamIdByName,
}: {
  items: Array<{ type: string; subject_id: string; subject_name: string; team_name: string | null; blurb: string }>;
  slug: string;
  season: string;
  teamIdByName: Map<string, string>;
}): JSX.Element | null {
  if (!items.length) return null;
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {items.map((s, i) => {
        const isPlayer = s.type === 'player_of_week';
        return (
          <div
            key={`${s.type}-${i}`}
            className={`flex gap-3 rounded-xl border p-4 ${
              isPlayer ? 'border-clay-200 bg-clay-50' : 'border-turf-200 bg-turf-50'
            }`}
          >
            <span
              aria-hidden
              className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg text-white ${
                isPlayer ? 'bg-clay-500' : 'bg-turf-600'
              }`}
            >
              {isPlayer ? <MedalIcon /> : <TrophyIcon />}
            </span>
            <div className="min-w-0">
              <p
                className={`text-xs font-semibold uppercase tracking-wide ${
                  isPlayer ? 'text-clay-700' : 'text-turf-800'
                }`}
              >
                {isPlayer ? 'Player of the Week' : 'Hot Team'}
              </p>
              {!isPlayer ? (
                <a href={teamHref(slug, s.subject_id, season)} className="text-lg font-bold text-app-fg hover:underline">
                  {s.subject_name}
                </a>
              ) : (
                <p className="text-lg font-bold text-app-fg">{s.subject_name}</p>
              )}
              {s.team_name ? (
                (() => {
                  const tid = teamIdByName.get(s.team_name.trim().toLowerCase());
                  return tid ? (
                    <a href={teamHref(slug, tid, season)} className="text-sm text-app-fg-muted hover:underline">
                      {s.team_name}
                    </a>
                  ) : (
                    <p className="text-sm text-app-fg-muted">{s.team_name}</p>
                  );
                })()
              ) : null}
              {s.blurb ? <p className="mt-0.5 text-sm text-app-fg">{s.blurb}</p> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MedalIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="15" r="5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 11L6 4M15 11l3-7M9 4h6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TrophyIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
      <path
        d="M7 4h10v4a5 5 0 01-10 0V4zM5 5H3v1a3 3 0 003 3M19 5h2v1a3 3 0 01-3 3M9 17h6M10 21h4M12 13v4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
