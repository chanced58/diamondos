/**
 * Loads one game's events/lineups/rosters and derives every stat the stats
 * page renders and the Home Team export needs. Extracted from the stats page so
 * the page and the export route compute stats identically.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  deriveBattingStats,
  derivePitchingStats,
  weAreHome,
  computeOpponentBatting,
  applyPitchReverted,
  computeLineScore,
} from '@baseball/shared';
import type { BattingStats, PitchingStats, OppBattingRow } from '@baseball/shared';
import {
  DB_TO_POSITION,
  computeFieldingStats,
  computeBaserunningStats,
  type FieldingStatRow,
  type LineupEntry,
} from './derive';

export interface RosterPlayer {
  id: string;
  firstName: string;
  lastName: string;
  jerseyNumber: number | null;
}

/** Parse a jersey number, preserving 0. Returns null only when unparseable. */
function parseJersey(value: string | number | null | undefined): number | null {
  if (value == null) return null;
  if (typeof value === 'number') return value;
  const n = parseInt(value, 10);
  return Number.isNaN(n) ? null : n;
}

export interface GameStatsBundle {
  game: {
    id: string;
    teamId: string;
    opponentName: string | null;
    locationType: string;
    neutralHomeTeam: string | null;
    status: string;
    seasonId: string | null;
    opponentTeamId: string | null;
    scheduledAt: string | null;
  };
  teamName: string;
  isHome: boolean;
  ourBatting: BattingStats[];
  oppBatting: OppBattingRow[];
  ourPitching: PitchingStats[];
  oppPitching: PitchingStats[];
  ourFielding: FieldingStatRow[];
  oppFielding: FieldingStatRow[];
  lineScore: ReturnType<typeof computeLineScore>;
  baserunning: Record<string, { sb: number; cs: number }>;
  roster: RosterPlayer[];
}

/**
 * Fetch and derive all stats for a game. Returns null when the game does not
 * exist; callers handle auth and the not-yet-started guard.
 */
export async function loadGameStats(
  db: SupabaseClient,
  gameId: string,
): Promise<GameStatsBundle | null> {
  const { data: game, error: gameError } = await db
    .from('games')
    .select(
      'id, team_id, opponent_name, location_type, neutral_home_team, status, home_score, away_score, season_id, opponent_team_id, scheduled_at',
    )
    .eq('id', gameId)
    .single();

  // PGRST116 = no rows matched (genuine not-found); any other error is a real
  // failure that must not be silently treated as a missing game.
  if (gameError && gameError.code !== 'PGRST116') {
    console.error('loadGameStats: game lookup failed', { gameId, error: gameError.message });
    throw new Error(`Failed to load game ${gameId}`);
  }
  if (!game) return null;

  const [lineupResult, eventsResult, rosterResult, teamResult, opponentPlayersResult, opponentLineupResult] =
    await Promise.all([
      db
        .from('game_lineups')
        .select('player_id, batting_order, starting_position, players(id, first_name, last_name, jersey_number)')
        .eq('game_id', gameId)
        .order('batting_order', { ascending: true, nullsFirst: false }),
      db
        .from('game_events')
        .select('*')
        .eq('game_id', gameId)
        .order('sequence_number'),
      // Fetch ALL players (not just active) so deactivated players who
      // participated in this game still resolve their names in stats.
      db
        .from('players')
        .select('id, first_name, last_name, jersey_number')
        .eq('team_id', game.team_id)
        .order('last_name'),
      db.from('teams').select('*').eq('id', game.team_id).single(),
      game.opponent_team_id
        ? db
            .from('opponent_players')
            .select('id, first_name, last_name, jersey_number')
            .eq('opponent_team_id', game.opponent_team_id)
            .order('last_name')
        : Promise.resolve({ data: [] as { id: string; first_name: string; last_name: string; jersey_number: string | null }[] }),
      game.opponent_team_id
        ? db
            .from('opponent_game_lineups')
            .select('opponent_player_id, batting_order, starting_position, opponent_players(id, first_name, last_name, jersey_number)')
            .eq('game_id', gameId)
            .order('batting_order', { ascending: true, nullsFirst: false })
        : Promise.resolve({ data: [] as { opponent_player_id: string; batting_order: number | null; starting_position: string | null; opponent_players: unknown }[] }),
    ]);

  // The lineup, events, and roster reads drive every derived stat — a silent
  // failure here would export wrong numbers, so fail loudly instead.
  for (const [table, result] of [
    ['game_lineups', lineupResult],
    ['game_events', eventsResult],
    ['players', rosterResult],
  ] as const) {
    if (result.error) {
      console.error('loadGameStats: read failed', { gameId, table, error: result.error.message });
      throw new Error(`Failed to load stats for game ${gameId}`);
    }
  }

  const teamName = teamResult.data?.name ?? 'Our Team';

  const lineup: LineupEntry[] = (lineupResult.data ?? []).map((l) => {
    const p = l.players as unknown as { id: string; first_name: string; last_name: string; jersey_number: number | null } | null;
    return {
      playerId: l.player_id as string,
      battingOrder: (l.batting_order as number | null) ?? 0,
      startingPosition: l.starting_position ? (DB_TO_POSITION[l.starting_position] ?? l.starting_position) : null,
      player: {
        id: p?.id ?? null,
        firstName: p?.first_name ?? '',
        lastName: p?.last_name ?? '',
        jerseyNumber: p?.jersey_number ?? null,
      },
    };
  });

  const opponentLineup: LineupEntry[] = (opponentLineupResult.data ?? []).map((l) => {
    const p = l.opponent_players as unknown as { id: string; first_name: string; last_name: string; jersey_number: string | null } | null;
    return {
      playerId: l.opponent_player_id as string,
      battingOrder: (l.batting_order as number | null) ?? 0,
      startingPosition: l.starting_position ? (DB_TO_POSITION[l.starting_position] ?? l.starting_position) : null,
      player: {
        id: p?.id ?? null,
        firstName: p?.first_name ?? '',
        lastName: p?.last_name ?? '',
        jerseyNumber: parseJersey(p?.jersey_number),
      },
    };
  });

  const teamRoster: RosterPlayer[] = (rosterResult.data ?? []).map((p) => ({
    id: p.id,
    firstName: p.first_name,
    lastName: p.last_name,
    jerseyNumber: p.jersey_number ?? null,
  }));

  const opponentRoster: RosterPlayer[] = (opponentPlayersResult.data ?? []).map((p) => ({
    id: p.id,
    firstName: p.first_name,
    lastName: p.last_name,
    jerseyNumber: parseJersey(p.jersey_number),
  }));

  // ── Filter out reverted events ──────────────────────────────────────────────
  const allEvents = (eventsResult.data ?? []) as Record<string, unknown>[];
  // Find most recent game_start (skip game_reset boundary)
  const lastResetIndex = allEvents.map((e) => e.event_type).lastIndexOf('game_reset');
  const activeEvents = lastResetIndex === -1 ? allEvents : allEvents.slice(lastResetIndex + 1);
  const effectiveEvents = applyPitchReverted(activeEvents);

  // ── Batting stats (our team) ────────────────────────────────────────────────
  const ourPlayers = teamRoster.map((p) => ({ id: p.id, firstName: p.firstName, lastName: p.lastName }));
  const ourPlayerIds = new Set(teamRoster.map((p) => p.id));

  const isHome = weAreHome(game.location_type, game.neutral_home_team);
  const ourLineupForInference = lineup
    .filter((l) => l.playerId && l.battingOrder > 0)
    .map((l) => ({ playerId: l.playerId, battingOrder: l.battingOrder }));
  const lineupsByGameId = new Map([[gameId, { ourLineup: ourLineupForInference, isHome }]]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ourBattingMap = deriveBattingStats(effectiveEvents as any, ourPlayers, lineupsByGameId);
  const ourBatting: BattingStats[] = Array.from(ourBattingMap.values())
    .filter((s) => s.plateAppearances > 0 && ourPlayerIds.has(s.playerId));

  // ── Pitching stats (both teams) ─────────────────────────────────────────────
  const allPlayersForPitching = [
    ...teamRoster.map((p) => ({ id: p.id, firstName: p.firstName, lastName: p.lastName })),
    ...opponentRoster.map((p) => ({ id: p.id, firstName: p.firstName, lastName: p.lastName })),
  ];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allPitchingMap = derivePitchingStats(effectiveEvents as any, allPlayersForPitching);

  const oppPlayerIds = new Set(opponentRoster.map((p) => p.id));

  const ourPitching: PitchingStats[] = Array.from(allPitchingMap.values())
    .filter((s) => ourPlayerIds.has(s.playerId) && s.totalPitches > 0);
  const oppPitching: PitchingStats[] = Array.from(allPitchingMap.values())
    .filter((s) => oppPlayerIds.has(s.playerId) && s.totalPitches > 0);

  // ── Opponent batting (simplified) ───────────────────────────────────────────
  const oppPlayerNameMap = new Map(opponentRoster.map((p) => [p.id, `${p.firstName} ${p.lastName}`]));
  for (const entry of opponentLineup) {
    if (!oppPlayerNameMap.has(entry.playerId)) {
      oppPlayerNameMap.set(entry.playerId, `${entry.player.firstName} ${entry.player.lastName}`);
    }
  }
  const oppBatting = computeOpponentBatting(effectiveEvents, oppPlayerNameMap);

  // ── Fielding stats (our team) ───────────────────────────────────────────────
  const ourPlayerNameMap = new Map<string, { name: string; position: string }>();
  for (const entry of lineup) {
    ourPlayerNameMap.set(entry.playerId, {
      name: `${entry.player.firstName} ${entry.player.lastName}`,
      position: entry.startingPosition ?? '',
    });
  }
  for (const p of teamRoster) {
    if (!ourPlayerNameMap.has(p.id)) {
      ourPlayerNameMap.set(p.id, { name: `${p.firstName} ${p.lastName}`, position: '' });
    }
  }

  const ourFielding = computeFieldingStats(effectiveEvents, lineup, isHome, ourPlayerNameMap);

  // ── Fielding stats (opponent) ─────────────────────────────────────────────
  const oppFieldingNameMap = new Map<string, { name: string; position: string }>();
  for (const entry of opponentLineup) {
    oppFieldingNameMap.set(entry.playerId, {
      name: `${entry.player.firstName} ${entry.player.lastName}`,
      position: entry.startingPosition ?? '',
    });
  }
  for (const p of opponentRoster) {
    if (!oppFieldingNameMap.has(p.id)) {
      oppFieldingNameMap.set(p.id, { name: `${p.firstName} ${p.lastName}`, position: '' });
    }
  }

  const oppFielding = computeFieldingStats(effectiveEvents, opponentLineup, isHome, oppFieldingNameMap, true);

  // ── Baserunning + line score ────────────────────────────────────────────────
  const baserunning = computeBaserunningStats(effectiveEvents, ourPlayerIds);
  const lineScore = computeLineScore(effectiveEvents);

  return {
    game: {
      id: game.id,
      teamId: game.team_id,
      opponentName: game.opponent_name,
      locationType: game.location_type,
      neutralHomeTeam: game.neutral_home_team,
      status: game.status,
      seasonId: game.season_id,
      opponentTeamId: game.opponent_team_id,
      scheduledAt: game.scheduled_at,
    },
    teamName,
    isHome,
    ourBatting,
    oppBatting,
    ourPitching,
    oppPitching,
    ourFielding,
    oppFielding,
    lineScore,
    baserunning,
    roster: teamRoster,
  };
}
