import type { SupabaseClient } from '@supabase/supabase-js';
import {
  deriveBattingStats,
  derivePitchingStats,
  selectSpotlights,
  type BattingLineupContext,
} from '@baseball/shared';
import { resolveLeagueSeasonGameIds } from './season';
import { computeStandings, weAreHome, type GameRow } from './standings';
import { combinePlayerStats, type PlayerTeamInfo } from './aggregate';

const NIL = '00000000-0000-0000-0000-000000000000';

/** Throw with context if a Supabase query returned an error. */
function assertOk(error: { message: string } | null, what: string, leagueId: string, season: string): void {
  if (error) throw new Error(`recompute ${what} failed (league=${leagueId} season=${season}): ${error.message}`);
}

/** Remove all snapshot rows for one league-season. */
async function clearLeagueSeasonSnapshots(db: SupabaseClient, leagueId: string, season: string): Promise<void> {
  await db.from('league_player_stat_snapshot').delete().eq('league_id', leagueId).eq('season', season);
  await db.from('league_standings_snapshot').delete().eq('league_id', leagueId).eq('season', season);
  await db.from('league_team_stat_snapshot').delete().eq('league_id', leagueId).eq('season', season);
  await db.from('league_spotlight_snapshot').delete().eq('league_id', leagueId).eq('season', season);
}

/**
 * Recompute and upsert all four league snapshot tables for one league-season.
 *
 * Reuses the @baseball/shared TS stat reducers. Player→team attribution comes
 * from players.team_id (game_lineups has no team_id), and home/away is derived
 * from the game row (game_lineups has no is_home). Fielding stats are not
 * surfaced on the home page in v1, so fielding aggregation is skipped.
 */
export async function recomputeLeagueSnapshot(
  db: SupabaseClient,
  leagueId: string,
  season: string,
): Promise<void> {
  // 1) league team ids
  const { data: members, error: membersErr } = await db
    .from('league_members')
    .select('team_id')
    .eq('league_id', leagueId)
    .eq('is_active', true);
  assertOk(membersErr, 'league_members', leagueId, season);
  const teamIds = (members ?? [])
    .map((m: { team_id: string | null }) => m.team_id)
    .filter((t: string | null): t is string => Boolean(t));
  if (teamIds.length === 0) {
    // League has no active members — clear any stale snapshots so the public
    // page doesn't keep serving old standings/leaders indefinitely.
    await clearLeagueSeasonSnapshots(db, leagueId, season);
    return;
  }
  const teamIdSet = new Set(teamIds);

  // 2) games in this league-season
  const gameIds = await resolveLeagueSeasonGameIds(db, teamIds, season);
  const gameIdList = gameIds.length ? gameIds : [NIL];

  // 3) load games, events, lineups, players, teams, opt-outs
  const [
    { data: games, error: gamesErr },
    { data: events, error: eventsErr },
    { data: lineups, error: lineupsErr },
    { data: teams, error: teamsErr },
    { data: optOuts, error: optOutsErr },
  ] = await Promise.all([
    db
      .from('games')
      .select('id, team_id, home_score, away_score, location_type, neutral_home_team, status')
      .in('id', gameIdList),
    // Reducers require events ordered by (game_id, sequence_number) ascending.
    db
      .from('game_events')
      .select('*')
      .in('game_id', gameIdList)
      .order('game_id', { ascending: true })
      .order('sequence_number', { ascending: true }),
    db
      .from('game_lineups')
      .select('game_id, player_id, batting_order, count_toward_stats')
      .in('game_id', gameIdList),
    db.from('teams').select('id, name').in('id', teamIds),
    db.from('league_players').select('player_id, public_opt_out').eq('league_id', leagueId),
  ]);
  assertOk(gamesErr, 'games', leagueId, season);
  assertOk(eventsErr, 'game_events', leagueId, season);
  assertOk(lineupsErr, 'game_lineups', leagueId, season);
  assertOk(teamsErr, 'teams', leagueId, season);
  assertOk(optOutsErr, 'league_players', leagueId, season);

  const teamName = new Map<string, string>((teams ?? []).map((t: any) => [t.id, t.name]));
  const optOut = new Map<string, boolean>((optOuts ?? []).map((o: any) => [o.player_id, o.public_opt_out]));

  // 4) player rows (for names + team attribution)
  const playerIds = Array.from(new Set((lineups ?? []).map((l: any) => l.player_id)));
  const { data: playerRows, error: playerRowsErr } = await db
    .from('players')
    .select('id, first_name, last_name, team_id')
    .in('id', playerIds.length ? playerIds : [NIL]);
  assertOk(playerRowsErr, 'players', leagueId, season);
  const players = (playerRows ?? []).map((p: any) => ({
    id: p.id,
    firstName: p.first_name,
    lastName: p.last_name,
  }));

  // 5) team attribution (players.team_id, only if in this league) + opt-out flag
  const teamOf = new Map<string, PlayerTeamInfo>();
  for (const p of playerRows ?? []) {
    if (!teamIdSet.has(p.team_id)) continue;
    teamOf.set(p.id, {
      teamId: p.team_id,
      teamName: teamName.get(p.team_id) ?? '',
      firstName: p.first_name,
      lastName: p.last_name,
      optOut: optOut.get(p.id) ?? false,
    });
  }

  // 6) per-game batting lineup context (home/away from the game; honor count_toward_stats)
  const gameById = new Map<string, any>((games ?? []).map((g: any) => [g.id, g]));
  const battingCtx = new Map<string, BattingLineupContext>();
  const byGame = new Map<string, any[]>();
  for (const l of lineups ?? []) {
    if (!byGame.has(l.game_id)) byGame.set(l.game_id, []);
    byGame.get(l.game_id)!.push(l);
  }
  for (const [gameId, ls] of byGame) {
    const g = gameById.get(gameId);
    if (!g) continue;
    const excluded = new Set<string>(
      ls.filter((l) => l.count_toward_stats === false).map((l) => l.player_id),
    );
    battingCtx.set(gameId, {
      ourLineup: ls.map((l) => ({ playerId: l.player_id, battingOrder: l.batting_order })),
      isHome: weAreHome(g),
      excludedPlayerIds: excluded,
    });
  }

  // 7) run reducers
  const evts = (events ?? []) as any;
  const batting = deriveBattingStats(evts, players, battingCtx);
  const pitching = derivePitchingStats(evts, players);

  const playerSnapshotRows = combinePlayerStats({
    batting,
    pitching,
    fielding: new Map(),
    teamOf,
    leagueId,
    season,
  });

  // 8) standings
  const standings = computeStandings((games ?? []) as GameRow[], teamIds);

  // 9) team stats — team AVG (hits/AB) and team ERA (ER*7 / IP) from the reducer maps
  const teamStatRows = Array.from(standings.entries()).map(([teamId, rec]) => {
    let hits = 0;
    let atBats = 0;
    let earnedRuns = 0;
    let outs = 0;
    for (const [pid, info] of teamOf) {
      if (info.teamId !== teamId) continue;
      const b = batting.get(pid);
      if (b) {
        hits += b.hits ?? 0;
        atBats += b.atBats ?? 0;
      }
      const p = pitching.get(pid);
      if (p) {
        earnedRuns += p.earnedRunsAllowed ?? 0;
        outs += p.inningsPitchedOuts ?? 0;
      }
    }
    const teamAvg = atBats > 0 ? Number((hits / atBats).toFixed(3)) : 0;
    const teamEra = outs > 0 ? Number(((earnedRuns * 7) / (outs / 3)).toFixed(2)) : 0;
    return {
      league_id: leagueId,
      season,
      team_id: teamId,
      team_name: teamName.get(teamId) ?? '',
      stats: {
        teamAvg,
        teamEra,
        runsScored: rec.runsFor,
        runDiff: rec.runsFor - rec.runsAgainst,
      },
    };
  });

  const standingRows = Array.from(standings.entries()).map(([teamId, rec]) => ({
    league_id: leagueId,
    season,
    team_id: teamId,
    division_id: null,
    team_name: teamName.get(teamId) ?? '',
    wins: rec.wins,
    losses: rec.losses,
    ties: rec.ties,
    runs_for: rec.runsFor,
    runs_against: rec.runsAgainst,
    win_pct: rec.winPct,
    streak: '',
  }));

  // 10) spotlights
  const batterCandidates = playerSnapshotRows
    .filter((r) => !r.public_opt_out)
    .map((r) => ({
      id: r.player_id,
      name: `${r.first_name} ${r.last_name}`,
      teamName: r.team_name,
      score: (r.stats.ops ?? 0) * Math.min(r.plate_appearances, 50),
      qualifierValue: r.plate_appearances,
    }));
  const teamCandidates = teamStatRows.map((t) => ({
    id: t.team_id,
    name: t.team_name,
    score: t.stats.runDiff,
    qualifierValue: 1,
  }));
  const spot = selectSpotlights({ batters: batterCandidates, teams: teamCandidates, minBatterQualifier: 5 });
  const spotlightRows = [
    spot.playerOfWeek && {
      league_id: leagueId,
      season,
      type: 'player_of_week',
      subject_id: spot.playerOfWeek.id,
      subject_name: spot.playerOfWeek.name,
      team_name: spot.playerOfWeek.teamName ?? null,
      blurb: 'Top performer over the season',
      window_days: 7,
    },
    spot.hotTeam && {
      league_id: leagueId,
      season,
      type: 'hot_team',
      subject_id: spot.hotTeam.id,
      subject_name: spot.hotTeam.name,
      team_name: null,
      blurb: 'Best run differential',
      window_days: 7,
    },
  ].filter(Boolean) as Array<Record<string, unknown>>;

  // 11) replace snapshot rows for this league-season.
  // NOTE: not a single transaction (supabase-js limitation) — a mid-write
  // failure is healed by the next finalize/cron recompute. A transactional RPC
  // or staged version-swap is tracked as a v2 hardening item.
  await clearLeagueSeasonSnapshots(db, leagueId, season);
  if (playerSnapshotRows.length) await db.from('league_player_stat_snapshot').insert(playerSnapshotRows);
  if (standingRows.length) await db.from('league_standings_snapshot').insert(standingRows);
  if (teamStatRows.length) await db.from('league_team_stat_snapshot').insert(teamStatRows);
  if (spotlightRows.length) await db.from('league_spotlight_snapshot').insert(spotlightRows);
}
