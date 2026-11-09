/** Build a URL to a league's public stats page, optionally season/tab scoped. */
export function leagueStatsHref(slug: string, season?: string, tab?: 'batting' | 'pitching' | 'teams'): string {
  const params = new URLSearchParams();
  if (season) params.set('season', season);
  if (tab) params.set('tab', tab);
  const qs = params.toString().replace(/\+/g, '%20');
  return qs ? `/l/${slug}/stats?${qs}` : `/l/${slug}/stats`;
}
