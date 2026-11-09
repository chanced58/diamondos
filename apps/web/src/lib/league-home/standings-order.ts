/** Fixed-locale collation so server (SSR) and browser order ties identically. */
const collator = new Intl.Collator('en');

/** A minimal standings shape used for ranking and name→id mapping. */
export interface RankStandingRow {
  team_id: string | null;
  team_name?: string;
  win_pct: number;
}

/**
 * Standings order: win_pct descending, then team name (missing names last), then
 * team_id so the order is stable regardless of snapshot row order.
 */
export function compareStandings(a: RankStandingRow, b: RankStandingRow): number {
  if (b.win_pct !== a.win_pct) return b.win_pct - a.win_pct;
  if (a.team_name && b.team_name) {
    const byName = collator.compare(a.team_name, b.team_name);
    if (byName !== 0) return byName;
  } else if (a.team_name || b.team_name) {
    return a.team_name ? -1 : 1;
  }
  return collator.compare(String(a.team_id), String(b.team_id));
}
