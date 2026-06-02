export interface PlayerTeamInfo {
  teamId: string;
  teamName: string;
  firstName: string;
  lastName: string;
  optOut: boolean;
}

export interface CombineInput {
  batting: Map<string, any>;
  pitching: Map<string, any>;
  fielding: Map<string, any>;
  teamOf: Map<string, PlayerTeamInfo>;
  leagueId: string;
  season: string;
}

export interface PlayerSnapshotRow {
  league_id: string;
  season: string;
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
