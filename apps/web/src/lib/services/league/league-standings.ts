import { weAreHome, type StandingsDivision, type StandingsGameResult, type StandingsTeamRow } from '@baseball/shared';
import type { LeagueDivision, LeagueMember } from '@baseball/database';

/**
 * League standings from completed games, as the web /league page has always
 * computed them: each platform team from its own games, each league opponent
 * team from the inverse side of the games played against it. Pure, so the
 * service and its tests share it.
 */

type LocationType = Parameters<typeof weAreHome>[0];
type NeutralHomeTeam = Parameters<typeof weAreHome>[1];

export interface CompletedGame {
  id: string;
  /** The coaching team's id (a platform team's own game). */
  team_id: string;
  /** The league opponent played, when it is one. */
  opponent_team_id: string | null;
  home_score: number | null;
  away_score: number | null;
  location_type: LocationType;
  neutral_home_team: NeutralHomeTeam;
  scheduled_at: string | null;
}

type GameOutcome = { date: string | null; result: StandingsGameResult };
type TeamRecord = { wins: number; losses: number; ties: number; rf: number; ra: number; games: GameOutcome[] };

const emptyRecord = (): TeamRecord => ({ wins: 0, losses: 0, ties: 0, rf: 0, ra: 0, games: [] });

/** One game into a team's record, from that team's side. */
function tally(record: TeamRecord, our: number, their: number, date: string | null): void {
  const result: StandingsGameResult = our > their ? 'W' : our < their ? 'L' : 'T';
  if (result === 'W') record.wins++;
  else if (result === 'L') record.losses++;
  else record.ties++;
  record.rf += our;
  record.ra += their;
  record.games.push({ date, result });
}

/** The last five results (oldest first) and the current streak. */
function summarize(games: GameOutcome[]): Pick<StandingsTeamRow, 'last5' | 'streak'> {
  const ordered = [...games].sort((a, b) => (a.date ? Date.parse(a.date) : 0) - (b.date ? Date.parse(b.date) : 0));
  let streak: StandingsTeamRow['streak'] = null;
  for (let i = ordered.length - 1; i >= 0; i--) {
    const result = ordered[i].result;
    if (!streak) streak = { type: result, count: 1 };
    else if (streak.type === result) streak.count++;
    else break;
  }
  return { last5: ordered.slice(-5).map((g) => g.result), streak };
}

/**
 * Standings by division, named divisions alphabetically and unassigned teams
 * last, plus the number of games counted. `platformGames` are the platform
 * teams' completed games; `opponentGames` the completed games against the
 * league's opponent teams (a game can be in both).
 */
export function buildStandings(input: {
  teams: LeagueMember[];
  divisions: LeagueDivision[];
  platformGames: CompletedGame[];
  opponentGames: CompletedGame[];
  activeTeamId: string;
}): { divisions: StandingsDivision[]; gamesPlayed: number } {
  const { teams, divisions, platformGames, opponentGames, activeTeamId } = input;
  const records = new Map<string, TeamRecord>(teams.map((t) => [(t.team_id ?? t.opponent_team_id)!, emptyRecord()]));
  const gameIds = new Set<string>();

  for (const g of platformGames) {
    gameIds.add(g.id);
    const record = records.get(g.team_id);
    if (!record) continue;
    const isHome = weAreHome(g.location_type, g.neutral_home_team);
    const home = g.home_score ?? 0;
    const away = g.away_score ?? 0;
    tally(record, isHome ? home : away, isHome ? away : home, g.scheduled_at);
  }
  for (const g of opponentGames) {
    gameIds.add(g.id);
    const record = g.opponent_team_id ? records.get(g.opponent_team_id) : undefined;
    if (!record) continue;
    // The opponent is the other side of the coaching team.
    const coachIsHome = weAreHome(g.location_type, g.neutral_home_team);
    const home = g.home_score ?? 0;
    const away = g.away_score ?? 0;
    tally(record, coachIsHome ? away : home, coachIsHome ? home : away, g.scheduled_at);
  }

  const toRow = (t: LeagueMember): StandingsTeamRow => {
    const key = (t.team_id ?? t.opponent_team_id)!;
    const record = records.get(key) ?? emptyRecord();
    const total = record.wins + record.losses + record.ties;
    return {
      key,
      name: t.teams?.name ?? t.opponent_teams?.name ?? 'Unknown',
      organization: t.teams?.organization ?? null,
      teamId: t.team_id ?? null,
      isActive: t.team_id === activeTeamId,
      isOpponent: Boolean(t.opponent_team_id),
      wins: record.wins,
      losses: record.losses,
      ties: record.ties,
      pct: total > 0 ? record.wins / total : 0,
      rf: record.rf,
      ra: record.ra,
      diff: record.rf - record.ra,
      gamesPlayed: total,
      ...summarize(record.games),
    };
  };

  const byDivision = new Map<string | null, LeagueMember[]>();
  for (const t of teams) byDivision.set(t.division_id, [...(byDivision.get(t.division_id) ?? []), t]);
  const divisionNames = new Map(divisions.map((d) => [d.id, d.name]));

  return {
    gamesPlayed: gameIds.size,
    divisions: [...byDivision.entries()]
      .sort(([a], [b]) => {
        if (a === null) return 1;
        if (b === null) return -1;
        return (divisionNames.get(a) ?? '').localeCompare(divisionNames.get(b) ?? '');
      })
      .map(([divisionId, divisionTeams]) => ({
        id: divisionId ?? 'none',
        name: divisionId ? divisionNames.get(divisionId) ?? 'Division' : divisions.length > 0 ? 'Unassigned' : 'Teams',
        teams: divisionTeams.map(toRow),
      })),
  };
}

/** The team's place across the whole league by win percentage (then wins), or null when it isn't in the standings. */
export function overallRank(divisions: StandingsDivision[]): number | null {
  const ranked = divisions.flatMap((d) => d.teams).sort((a, b) => b.pct - a.pct || b.wins - a.wins);
  const index = ranked.findIndex((r) => r.isActive);
  return index >= 0 ? index + 1 : null;
}
