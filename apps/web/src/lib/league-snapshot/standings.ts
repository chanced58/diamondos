import { weAreHome } from '@baseball/shared';

export interface GameRow {
  team_id: string;
  opponent_team_id: string | null;
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

function emptyRecord(): TeamRecord {
  return { wins: 0, losses: 0, ties: 0, runsFor: 0, runsAgainst: 0, winPct: 0 };
}

/** The recording team's runs scored (`our`) and allowed (`their`) for one game. */
function scoresForRecorder(g: GameRow): { our: number; their: number } {
  const isHome = weAreHome(g.location_type, g.neutral_home_team);
  return {
    our: isHome ? g.home_score : g.away_score,
    their: isHome ? g.away_score : g.home_score,
  };
}

/** Fill in winPct = W/(W+L+T), rounded to 4 decimals, for every record in the map. */
function finalizeWinPct(rec: Map<string, TeamRecord>): void {
  for (const r of rec.values()) {
    const total = r.wins + r.losses + r.ties;
    r.winPct = total === 0 ? 0 : Number((r.wins / total).toFixed(4));
  }
}

/**
 * Tally W/L/T and run differential per team from each team's perspective.
 * Pass `allTeamIds` to seed zeroed records for league members with no completed
 * games yet, so they still appear in standings early in a season.
 */
export function computeStandings(games: GameRow[], allTeamIds: string[] = []): Map<string, TeamRecord> {
  const rec = new Map<string, TeamRecord>();
  for (const teamId of allTeamIds) rec.set(teamId, emptyRecord());
  for (const g of games) {
    if (g.status !== 'completed') continue;
    const r = rec.get(g.team_id) ?? emptyRecord();
    const { our, their } = scoresForRecorder(g);
    r.runsFor += our;
    r.runsAgainst += their;
    if (our > their) r.wins++;
    else if (our < their) r.losses++;
    else r.ties++;
    rec.set(g.team_id, r);
  }
  finalizeWinPct(rec);
  return rec;
}

/**
 * Tally W/L/T and run differential for opponent teams (teams listed in a league
 * only via `games.opponent_team_id`, never as the recording `team_id`).
 *
 * Each opponent's record is the INVERSE of the recording team's: the opponent's
 * runsFor is the recorder's runsAgainst, and wins/losses flip (ties stay ties).
 * Pass `opponentTeamIds` to seed zeroed records so opponent members with no games
 * yet still appear in standings.
 *
 * No double-counting: opponent teams never record their own games, so an
 * opponent's record derives solely from the inverse of platform members' games
 * against it. (The niche `opponent_teams.linked_team_id` case — an opponent that
 * also maps to a platform team — is out of scope.)
 */
export function computeOpponentStandings(games: GameRow[], opponentTeamIds: string[] = []): Map<string, TeamRecord> {
  const members = new Set(opponentTeamIds);
  const rec = new Map<string, TeamRecord>();
  for (const id of opponentTeamIds) rec.set(id, emptyRecord());
  for (const g of games) {
    if (g.status !== 'completed') continue;
    if (!g.opponent_team_id || !members.has(g.opponent_team_id)) continue;
    const r = rec.get(g.opponent_team_id) ?? emptyRecord();
    const { our, their } = scoresForRecorder(g);
    // Invert: the opponent's runs scored/allowed are the recorder's allowed/scored.
    r.runsFor += their;
    r.runsAgainst += our;
    if (their > our) r.wins++;
    else if (their < our) r.losses++;
    else r.ties++;
    rec.set(g.opponent_team_id, r);
  }
  finalizeWinPct(rec);
  return rec;
}
