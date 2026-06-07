/** Build a season-scoped URL to a team's public stat page. */
export function teamHref(slug: string, teamId: string, season?: string): string {
  const base = `/l/${slug}/team/${teamId}`;
  return season ? `${base}?season=${encodeURIComponent(season)}` : base;
}
