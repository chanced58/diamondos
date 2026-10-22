import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ALL_SEASONS,
  computeOpponentBatting,
  derivePitchingStats,
  deriveBattingStats,
  filterResetAndReverted,
  weAreHome,
  type BattingStats,
  type GameEvent,
  type OppBattingRow,
  type PitchingStats,
  type StatTier,
} from '@baseball/shared';
import { RELEVANT_EVENT_TYPES } from '@/app/(app)/compliance/constants';
import { buildLineupsByGameId } from './lineups';
import { fetchAllEventsForGames } from './fetch-events';

export interface PitcherComplianceInfo {
  pitchCount: number;
  requiredRestDays: number | null;
  canPitchNextDay: boolean | null;
  lastGameDate: string | null;
  pitches7d: number | null;
}

export interface CatcherInningsSummary {
  playerId: string;
  playerName: string;
  totalInnings: number;
  games: number;
  lastGameDate: string | null;
}

export interface OpponentTeamSeasonStats {
  teamId: string;
  teamName: string;
  gamesPlayed: number;
  wins: number;
  losses: number;
  ties: number;
  batting: OppBattingRow[];
  pitching: PitchingStats[];
}

export interface TeamSeasonStats {
  seasons: { id: string; name: string; isActive: boolean }[];
  season: { id: string; name: string } | null;
  gameCount: number;
  defaultTier: StatTier;
  pitching: PitchingStats[];
  batting: BattingStats[];
  complianceMap: Record<string, PitcherComplianceInfo>;
  catcher: CatcherInningsSummary[];
  opponents: OpponentTeamSeasonStats[];
  missingWaiverCount: number;
}

export interface LoadSeasonStatsOptions {
  /**
   * A season id, or `ALL_SEASONS` for every scored game. Omitted → the active
   * season. An unknown id → every scored game.
   */
  seasonId?: string;
  includeCatcher: boolean;
  includeOpponents: boolean;
}

type GameRow = {
  id: string;
  opponent_team_id: string | null;
  opponent_name: string | null;
  home_score: number | null;
  away_score: number | null;
  location_type: string;
  neutral_home_team: string | null;
};

type PlayerRef = { id: string; firstName: string; lastName: string };

/**
 * A team's season stats as the web Stats page and the mobile Stats tab show
 * them: every scored game of the season (completed or in progress) replayed
 * through the shared derivers, restricted to the team's own roster. Catcher
 * innings and opponent stats load only when asked for, since the web page
 * shows one tab at a time.
 *
 * Throws when any read fails, including an event log it can't read in full
 * (`fetchAllEventsForGames`), rather than deriving stats from part of a season.
 */
export async function loadTeamSeasonStats(
  db: SupabaseClient,
  teamId: string,
  options: LoadSeasonStatsOptions,
): Promise<TeamSeasonStats> {
  const [teamResult, seasonsResult] = await Promise.all([
    db.from('teams').select('level').eq('id', teamId).maybeSingle(),
    db
      .from('seasons')
      .select('id, name, is_active')
      .eq('team_id', teamId)
      .order('start_date', { ascending: false }),
  ]);
  const teamData = rowsOf(teamResult, 'teams');
  const allSeasons = rowsOf(seasonsResult, 'seasons');

  const seasons = (allSeasons ?? []).map((s) => ({ id: s.id as string, name: s.name as string, isActive: Boolean(s.is_active) }));
  const season = pickSeason(seasons, options.seasonId);

  let gamesQuery = db
    .from('games')
    .select('id, opponent_team_id, opponent_name, home_score, away_score, location_type, neutral_home_team')
    .eq('team_id', teamId)
    .in('status', ['completed', 'in_progress']);
  if (season) gamesQuery = gamesQuery.eq('season_id', season.id);
  const games = (rowsOf(await gamesQuery, 'games') ?? []) as GameRow[];
  const gameIds = games.map((g) => g.id);

  // Paginated: a season with 12+ scored games easily exceeds PostgREST's
  // 1000-row limit, which would otherwise silently truncate the events feed.
  const rawEvents = await fetchAllEventsForGames(db, gameIds, RELEVANT_EVENT_TYPES as unknown as readonly string[]);
  const filteredEvents = filterResetAndReverted(rawEvents);

  // Per-game lineups let deriveBattingStats infer the batter when a PA-closing
  // event carries a missing or 'unknown-batter' stub (best-effort).
  const lineupsByGameId = await buildLineupsByGameId(db, games);

  // ALL players (not just active) so deactivated players who played in past
  // games still resolve their names.
  const players = rowsOf(
    await db.from('players').select('id, first_name, last_name, is_active').eq('team_id', teamId),
    'players',
  );
  const playerList: PlayerRef[] = (players ?? []).map((p) => ({
    id: p.id as string,
    firstName: p.first_name as string,
    lastName: p.last_name as string,
  }));
  const activePlayerIds = (players ?? []).filter((p) => p.is_active).map((p) => p.id as string);

  // Only our roster: opponent ids leak through derivePitchingStats' fallback
  // coalesce of pitcherId ?? opponentPitcherId, and misattributed batters.
  const teamPlayerIds = new Set(playerList.map((p) => p.id));

  // The derivers are typed GameEvent[] but read both snake_case and camelCase.
  const derivableEvents = filteredEvents as unknown as GameEvent[];

  const pitching = Array.from(derivePitchingStats(derivableEvents, playerList).values())
    .filter((s) => teamPlayerIds.has(s.playerId))
    .sort((a, b) => b.inningsPitchedOuts - a.inningsPitchedOuts);

  const batting = Array.from(deriveBattingStats(derivableEvents, playerList, lineupsByGameId).values())
    .filter((s) => teamPlayerIds.has(s.playerId))
    .sort((a, b) => b.plateAppearances - a.plateAppearances);

  const [complianceMap, missingWaiverCount, catcher, opponents] = await Promise.all([
    loadPitcherCompliance(db, pitching.map((s) => s.playerId)),
    countMissingWaivers(db, activePlayerIds),
    options.includeCatcher ? loadCatcherInnings(db, playerList, season?.id ?? null) : Promise.resolve([]),
    options.includeOpponents ? loadOpponentStats(db, games, filteredEvents, derivableEvents) : Promise.resolve([]),
  ]);

  return {
    seasons,
    season,
    gameCount: gameIds.length,
    defaultTier: statTierForLevel((teamData?.level as string | null | undefined) ?? null),
    pitching,
    batting,
    complianceMap,
    catcher,
    opponents,
    missingWaiverCount,
  };
}

/**
 * A query's rows, or a throw naming the failed query: a failed read must not
 * pass for an empty one (no games, no pitch counts) and render a wrong season.
 */
function rowsOf<T>(result: { data: T | null; error: { message: string } | null }, query: string): T | null {
  if (result.error) throw new Error(`${query} query failed: ${result.error.message}`);
  return result.data;
}

/** The stat tier a team's level starts on. */
export function statTierForLevel(level: string | null): StatTier {
  if (level === 'youth' || level === 'middle_school') return 'youth';
  if (level === 'college' || level === 'pro') return 'college';
  return 'high_school';
}

function pickSeason(
  seasons: { id: string; name: string; isActive: boolean }[],
  seasonId: string | undefined,
): { id: string; name: string } | null {
  if (seasonId === ALL_SEASONS) return null;
  const match = seasonId ? seasons.find((s) => s.id === seasonId) : seasons.find((s) => s.isActive);
  return match ? { id: match.id, name: match.name } : null;
}

/** Each pitcher's most recent `pitch_counts` row and rolling 7-day total. */
async function loadPitcherCompliance(
  db: SupabaseClient,
  pitcherIds: string[],
): Promise<Record<string, PitcherComplianceInfo>> {
  const complianceMap: Record<string, PitcherComplianceInfo> = {};
  if (pitcherIds.length === 0) return complianceMap;

  const [pitchCountsResult, rolling7dResult] = await Promise.all([
    db
      .from('pitch_counts')
      .select('player_id, pitch_count, required_rest_days, can_pitch_next_day, game_date')
      .in('player_id', pitcherIds)
      .order('game_date', { ascending: false }),
    db
      .from('v_pitcher_rolling_7d')
      .select('player_id, game_date, pitches_7d')
      .in('player_id', pitcherIds)
      .order('game_date', { ascending: false }),
  ]);
  const pitchCounts = rowsOf(pitchCountsResult, 'pitch_counts');
  const rolling7d = rowsOf(rolling7dResult, 'v_pitcher_rolling_7d');

  for (const row of pitchCounts ?? []) {
    if (complianceMap[row.player_id]) continue;
    complianceMap[row.player_id] = {
      pitchCount: row.pitch_count,
      requiredRestDays: row.required_rest_days,
      canPitchNextDay: row.can_pitch_next_day,
      lastGameDate: row.game_date,
      pitches7d: null,
    };
  }
  for (const row of rolling7d ?? []) {
    const existing = complianceMap[row.player_id];
    if (existing && existing.pitches7d === null) existing.pitches7d = row.pitches_7d;
  }
  return complianceMap;
}

/** Active players without a current (non-expired) liability waiver. */
async function countMissingWaivers(db: SupabaseClient, activePlayerIds: string[]): Promise<number> {
  if (activePlayerIds.length === 0) return 0;
  const waiverRows = rowsOf(
    await db
      .from('player_documents')
      .select('player_id, expires_on')
      .eq('document_type', 'liability_waiver')
      .eq('is_current', true)
      .in('player_id', activePlayerIds),
    'player_documents',
  );

  const today = new Date().toISOString().slice(0, 10);
  const covered = new Set(
    (waiverRows ?? []).filter((r) => !r.expires_on || r.expires_on >= today).map((r) => r.player_id as string),
  );
  return activePlayerIds.filter((id) => !covered.has(id)).length;
}

/** Innings caught per player for the season (or all seasons). */
async function loadCatcherInnings(
  db: SupabaseClient,
  playerList: PlayerRef[],
  seasonId: string | null,
): Promise<CatcherInningsSummary[]> {
  if (playerList.length === 0) return [];
  let query = db
    .from('catcher_innings')
    .select('player_id, innings_caught, game_date, season_id')
    .in('player_id', playerList.map((p) => p.id))
    .order('game_date', { ascending: false });
  if (seasonId) query = query.eq('season_id', seasonId);
  const data = rowsOf(await query, 'catcher_innings');

  const names = new Map(playerList.map((p) => [p.id, `${p.firstName} ${p.lastName}`]));
  const byPlayer = new Map<string, CatcherInningsSummary>();
  for (const row of data ?? []) {
    const summary = byPlayer.get(row.player_id) ?? {
      playerId: row.player_id as string,
      playerName: names.get(row.player_id) ?? 'Unknown',
      totalInnings: 0,
      games: 0,
      lastGameDate: null,
    };
    summary.totalInnings += Number(row.innings_caught ?? 0);
    summary.games += 1;
    if (!summary.lastGameDate || row.game_date > summary.lastGameDate) summary.lastGameDate = row.game_date;
    byPlayer.set(row.player_id, summary);
  }
  return Array.from(byPlayer.values()).sort((a, b) => b.totalInnings - a.totalInnings);
}

/** Per opponent team: our record against them and their batting and pitching. */
async function loadOpponentStats(
  db: SupabaseClient,
  games: GameRow[],
  filteredEvents: Record<string, unknown>[],
  derivableEvents: GameEvent[],
): Promise<OpponentTeamSeasonStats[]> {
  const oppTeamIds = [...new Set(games.map((g) => g.opponent_team_id).filter((id): id is string => id != null))];
  if (oppTeamIds.length === 0) return [];

  const [oppTeamsResult, oppPlayersResult] = await Promise.all([
    db.from('opponent_teams').select('id, name, abbreviation').in('id', oppTeamIds),
    db.from('opponent_players').select('id, opponent_team_id, first_name, last_name').in('opponent_team_id', oppTeamIds),
  ]);
  const oppTeams = rowsOf(oppTeamsResult, 'opponent_teams');
  const oppPlayers = rowsOf(oppPlayersResult, 'opponent_players') ?? [];

  const nameMap = new Map<string, string>(oppPlayers.map((p) => [p.id, `${p.first_name} ${p.last_name}`]));
  const playerToTeam = new Map<string, string>(oppPlayers.map((p) => [p.id, p.opponent_team_id]));

  const battingRows = computeOpponentBatting(filteredEvents, nameMap);
  const oppPlayerIds = new Set(oppPlayers.map((p) => p.id as string));
  const pitchingRows = Array.from(
    derivePitchingStats(
      derivableEvents,
      oppPlayers.map((p) => ({ id: p.id, firstName: p.first_name, lastName: p.last_name })),
    ).values(),
  ).filter((s) => oppPlayerIds.has(s.playerId) && s.totalPitches > 0);

  const records = new Map<string, { wins: number; losses: number; ties: number; gamesPlayed: number }>();
  for (const game of games) {
    if (!game.opponent_team_id) continue;
    const record = records.get(game.opponent_team_id) ?? { wins: 0, losses: 0, ties: 0, gamesPlayed: 0 };
    records.set(game.opponent_team_id, record);
    record.gamesPlayed++;

    const homeScore = game.home_score ?? 0;
    const awayScore = game.away_score ?? 0;
    if (homeScore === 0 && awayScore === 0) continue; // no score recorded yet

    const isHome = weAreHome(game.location_type, game.neutral_home_team);
    const ours = isHome ? homeScore : awayScore;
    const theirs = isHome ? awayScore : homeScore;
    if (ours > theirs) record.wins++;
    else if (theirs > ours) record.losses++;
    else record.ties++;
  }

  return (oppTeams ?? [])
    .map((team) => {
      const record = records.get(team.id) ?? { wins: 0, losses: 0, ties: 0, gamesPlayed: 0 };
      return {
        teamId: team.id as string,
        teamName: team.name as string,
        ...record,
        batting: battingRows.filter((r) => playerToTeam.get(r.playerId) === team.id),
        pitching: pitchingRows.filter((r) => playerToTeam.get(r.playerId) === team.id),
      };
    })
    .filter((t) => t.gamesPlayed > 0);
}
