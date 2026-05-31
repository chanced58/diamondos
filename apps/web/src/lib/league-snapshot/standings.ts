export interface GameRow {
  team_id: string;
  home_score: number;
  away_score: number;
  location_type: 'home' | 'away' | 'neutral';
  neutral_home_team: string | null;
  status: string;
}

export interface TeamRecord {
  wins: number;
  losses: number;
  ties: number;
  runsFor: number;
  runsAgainst: number;
  winPct: number;
}

function weAreHome(g: GameRow): boolean {
  if (g.location_type === 'home') return true;
  if (g.location_type === 'away') return false;
  // neutral: the team is "home" only if explicitly flagged as such
  return g.neutral_home_team === g.team_id;
}

/** Tally W/L/T and run differential per team from each team's perspective. */
export function computeStandings(games: GameRow[]): Map<string, TeamRecord> {
  const rec = new Map<string, TeamRecord>();
  for (const g of games) {
    if (g.status !== 'completed') continue;
    const r =
      rec.get(g.team_id) ??
      { wins: 0, losses: 0, ties: 0, runsFor: 0, runsAgainst: 0, winPct: 0 };
    const isHome = weAreHome(g);
    const our = isHome ? g.home_score : g.away_score;
    const their = isHome ? g.away_score : g.home_score;
    r.runsFor += our;
    r.runsAgainst += their;
    if (our > their) r.wins++;
    else if (our < their) r.losses++;
    else r.ties++;
    rec.set(g.team_id, r);
  }
  for (const r of rec.values()) {
    const total = r.wins + r.losses + r.ties;
    r.winPct = total === 0 ? 0 : Number((r.wins / total).toFixed(4));
  }
  return rec;
}
