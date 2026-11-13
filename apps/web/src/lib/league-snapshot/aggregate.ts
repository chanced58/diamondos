import { perGameRate, selectSpotlights, type BattingStats, type PitchingStats, type FieldingStats, type TeamRecord } from '@baseball/shared';

/**
 * `season`: a player's whole-season line across the league (leaderboards, the
 * league stats page). `team`: their line for one team (team pages); a traded
 * player has one per team.
 */
export type SnapshotScope = 'season' | 'team';

export interface PlayerTeamInfo {
  teamId: string;
  teamName: string;
  firstName: string;
  lastName: string;
  optOut: boolean;
}

export interface CombineInput {
  batting: ReadonlyMap<string, Partial<BattingStats>>;
  pitching: ReadonlyMap<string, Partial<PitchingStats>>;
  fielding: ReadonlyMap<string, Partial<FieldingStats>>;
  teamOf: Map<string, PlayerTeamInfo>;
  leagueId: string;
  season: string;
  /** Which snapshot the rows belong to; defaults to `season`. */
  scope?: SnapshotScope;
}

export interface PlayerSnapshotRow {
  league_id: string;
  season: string;
  scope: SnapshotScope;
  player_id: string;
  team_id: string;
  team_name: string;
  first_name: string;
  last_name: string;
  public_opt_out: boolean;
  stats: Record<string, number>;
  plate_appearances: number;
  innings_pitched_outs: number;
}

/**
 * Merge per-player batting/pitching/fielding stat maps into snapshot rows.
 * Stat field keys match the `field` values in @baseball/shared STAT_CATALOG.
 * Players without team attribution (e.g. the legacy unknown-batter stub) are
 * skipped.
 */
export function combinePlayerStats(input: CombineInput): PlayerSnapshotRow[] {
  const ids = new Set<string>([
    ...input.batting.keys(),
    ...input.pitching.keys(),
    ...input.fielding.keys(),
  ]);
  const rows: PlayerSnapshotRow[] = [];
  for (const id of ids) {
    const info = input.teamOf.get(id);
    if (!info) continue;
    const b = input.batting.get(id);
    const p = input.pitching.get(id);
    const f = input.fielding.get(id);
    const stats: Record<string, number> = {
      // batting
      avg: b?.avg ?? 0,
      obp: b?.obp ?? 0,
      slg: b?.slg ?? 0,
      ops: b?.ops ?? 0,
      homeRuns: b?.homeRuns ?? 0,
      rbi: b?.rbi ?? 0,
      hits: b?.hits ?? 0,
      runs: b?.runs ?? 0,
      doubles: b?.doubles ?? 0,
      triples: b?.triples ?? 0,
      walks: b?.walks ?? 0,
      qabPct: b?.qabPct ?? 0,
      hardHitPct: b?.hardHitPct ?? 0,
      // pitching (strikeoutsP avoids collision with batting strikeouts)
      era: p?.era ?? 0,
      whip: p?.whip ?? 0,
      strikeoutsP: p?.strikeouts ?? 0,
      // fielding
      fieldingPct: f?.fieldingPct ?? 0,
    };
    rows.push({
      league_id: input.leagueId,
      season: input.season,
      scope: input.scope ?? 'season',
      player_id: id,
      team_id: info.teamId,
      team_name: info.teamName,
      first_name: info.firstName,
      last_name: info.lastName,
      public_opt_out: info.optOut,
      stats,
      plate_appearances: b?.plateAppearances ?? 0,
      innings_pitched_outs: p?.inningsPitchedOuts ?? 0,
    });
  }
  return rows;
}

export interface StandingSnapshotRow {
  league_id: string;
  season: string;
  team_id: string | null;
  opponent_team_id: string | null;
  division_id: string | null;
  team_name: string;
  wins: number;
  losses: number;
  ties: number;
  runs_for: number;
  runs_against: number;
  win_pct: number;
  /** Current streak, "W3" / "L1" / "T1"; '' before the team's first game. */
  streak: string;
}

/** One standings row; exactly one of `teamId` (a platform team) and `opponentTeamId` is set. */
export function standingRow(input: {
  leagueId: string;
  season: string;
  teamId: string | null;
  opponentTeamId: string | null;
  divisionId: string | null;
  teamName: string;
  record: TeamRecord;
  /** The team's current streak (`formatCurrentStreak`); '' when it has none. */
  streak?: string;
}): StandingSnapshotRow {
  const { record } = input;
  return {
    league_id: input.leagueId,
    season: input.season,
    team_id: input.teamId,
    opponent_team_id: input.opponentTeamId,
    division_id: input.divisionId,
    team_name: input.teamName,
    wins: record.wins,
    losses: record.losses,
    ties: record.ties,
    runs_for: record.runsFor,
    runs_against: record.runsAgainst,
    win_pct: record.winPct,
    streak: input.streak ?? '',
  };
}

export interface TeamStatSnapshotRow {
  league_id: string;
  season: string;
  team_id: string;
  team_name: string;
  stats: { teamAvg: number; teamEra: number; runsScored: number; runDiff: number };
}

/**
 * A team's stat row: team AVG (hits/AB) and team ERA (ER * statInnings / IP)
 * summed over every batting and pitching line credited to the team, with runs
 * from its standings record.
 */
export function teamStatRow(input: {
  leagueId: string;
  season: string;
  teamId: string;
  teamName: string;
  record: TeamRecord;
  batting: Iterable<Partial<BattingStats>>;
  pitching: Iterable<Partial<PitchingStats>>;
  /** Innings per game for team ERA: the league's `getStatInnings`. */
  statInnings: number;
}): TeamStatSnapshotRow {
  let hits = 0;
  let atBats = 0;
  let earnedRuns = 0;
  let outs = 0;
  for (const line of input.batting) {
    hits += line.hits ?? 0;
    atBats += line.atBats ?? 0;
  }
  for (const line of input.pitching) {
    earnedRuns += line.earnedRunsAllowed ?? 0;
    outs += line.inningsPitchedOuts ?? 0;
  }
  return {
    league_id: input.leagueId,
    season: input.season,
    team_id: input.teamId,
    team_name: input.teamName,
    stats: {
      teamAvg: atBats > 0 ? Number((hits / atBats).toFixed(3)) : 0,
      teamEra: outs > 0 ? Number(perGameRate(earnedRuns, outs, input.statInnings).toFixed(2)) : 0,
      runsScored: input.record.runsFor,
      runDiff: input.record.runsFor - input.record.runsAgainst,
    },
  };
}

export interface SpotlightSnapshotRow {
  league_id: string;
  season: string;
  type: string;
  subject_id: string;
  subject_name: string;
  team_name: string | null;
  blurb: string;
  window_days: number;
}

/** Player of the week (from season-scope player rows) and hot team (best run differential). */
export function spotlightRows(
  players: readonly PlayerSnapshotRow[],
  teamStats: readonly TeamStatSnapshotRow[],
  leagueId: string,
  season: string,
): SpotlightSnapshotRow[] {
  const batterCandidates = players
    .filter((row) => !row.public_opt_out)
    .map((row) => ({
      id: row.player_id,
      name: `${row.first_name} ${row.last_name}`,
      teamName: row.team_name,
      score: (row.stats.ops ?? 0) * Math.min(row.plate_appearances, 50),
      qualifierValue: row.plate_appearances,
    }));
  const teamCandidates = teamStats.map((team) => ({
    id: team.team_id,
    name: team.team_name,
    score: team.stats.runDiff,
    qualifierValue: 1,
  }));
  const spot = selectSpotlights({ batters: batterCandidates, teams: teamCandidates, minBatterQualifier: 5 });
  const rows: SpotlightSnapshotRow[] = [];
  if (spot.playerOfWeek) {
    rows.push({
      league_id: leagueId,
      season,
      type: 'player_of_week',
      subject_id: spot.playerOfWeek.id,
      subject_name: spot.playerOfWeek.name,
      team_name: spot.playerOfWeek.teamName ?? null,
      blurb: 'Top performer over the season',
      window_days: 7,
    });
  }
  if (spot.hotTeam) {
    rows.push({
      league_id: leagueId,
      season,
      type: 'hot_team',
      subject_id: spot.hotTeam.id,
      subject_name: spot.hotTeam.name,
      team_name: null,
      blurb: 'Best run differential',
      window_days: 7,
    });
  }
  return rows;
}
