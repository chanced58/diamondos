import type { SupabaseClient } from '@supabase/supabase-js';
import {
  isCoachRole,
  leagueGameIdInputSchema,
  manualResultInputSchema,
  mergeWithDefaults,
  type ManualBattingLineInput,
  type ManualResultInput,
} from '@baseball/shared';
import { refreshLeagueGame } from '@/lib/league-games/refresh';
import { invalidInput, serviceError, serviceOk, type ServiceResult } from '../result';

/**
 * Hand-entered results for league games nobody scored in the app: a final
 * score, a box score, simple batting stats or a forfeit. Stored apart from
 * `game_events` (`league_game_manual_results` + `_batting_lines`) and fed into
 * the league standings and stats by `refreshLeagueGame`.
 *
 * Who: league admins, and head/assistant coaches and athletic directors of
 * either team. A coach cannot edit an entry a league admin made.
 */

const NOT_FOUND = 'Game not found.';
const SCORED_IN_APP = 'This game was scored in the app; settle it from the game page.';
const GENERIC_FAILURE = 'Something went wrong. Please try again.';

export interface ManualRosterPlayer {
  id: string;
  name: string;
  jersey: number | null;
}

export interface ManualResultRoster {
  teamId: string;
  players: ManualRosterPlayer[];
}

export interface LoadedManualResult {
  result: ManualResultInput | null;
  rosters: ManualResultRoster[];
  canEdit: boolean;
}

interface LeagueGameRow {
  id: string;
  league_id: string;
  home_team_id: string;
  away_team_id: string;
  home_game_id: string | null;
  away_game_id: string | null;
}

interface ResultRow {
  league_game_id: string;
  kind: 'final' | 'box' | 'batting' | 'forfeit';
  home_runs: number;
  away_runs: number;
  home_inning_runs: number[] | null;
  away_inning_runs: number[] | null;
  home_hits: number | null;
  away_hits: number | null;
  home_errors: number | null;
  away_errors: number | null;
  forfeit_winner_team_id: string | null;
  entered_by: string | null;
}

interface LineRow {
  team_id: string;
  player_id: string;
  ab: number;
  r: number;
  h: number;
  doubles: number;
  triples: number;
  hr: number;
  rbi: number;
  bb: number;
  so: number;
  hbp: number;
  sf: number;
  sb: number;
}

interface Powers {
  isLeagueAdmin: boolean;
  isLeagueStaff: boolean;
  isTeamCoach: boolean;
  /** Any active seat on either team. */
  onEitherTeam: boolean;
}

const sum = (values: number[]): number => values.reduce((total, value) => total + value, 0);

async function loadLeagueGame(db: SupabaseClient, leagueGameId: string): Promise<LeagueGameRow | null> {
  const { data, error } = await db
    .from('league_games')
    .select('id, league_id, home_team_id, away_team_id, home_game_id, away_game_id')
    .eq('id', leagueGameId)
    .maybeSingle();
  if (error) throw error;
  return (data as LeagueGameRow | null) ?? null;
}

async function isActiveLeagueAdmin(db: SupabaseClient, leagueId: string, userId: string | null): Promise<boolean> {
  if (!userId) return false;
  const { data, error } = await db
    .from('league_staff')
    .select('role')
    .eq('league_id', leagueId)
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle();
  if (error) throw error;
  return (data as { role: string } | null)?.role === 'league_admin';
}

async function loadPowers(db: SupabaseClient, game: LeagueGameRow, actorUserId: string): Promise<Powers> {
  const [staff, members] = await Promise.all([
    db
      .from('league_staff')
      .select('role')
      .eq('league_id', game.league_id)
      .eq('user_id', actorUserId)
      .eq('is_active', true)
      .maybeSingle(),
    db
      .from('team_members')
      .select('team_id, role')
      .eq('user_id', actorUserId)
      .eq('is_active', true)
      .in('team_id', [game.home_team_id, game.away_team_id]),
  ]);
  if (staff.error) throw staff.error;
  if (members.error) throw members.error;
  const role = (staff.data as { role: string } | null)?.role;
  const seats = (members.data ?? []) as { team_id: string; role: string }[];
  return {
    isLeagueAdmin: role === 'league_admin',
    isLeagueStaff: role === 'league_admin' || role === 'league_manager',
    isTeamCoach: seats.some((seat) => isCoachRole(seat.role)),
    onEitherTeam: seats.length > 0,
  };
}

async function hasEvents(db: SupabaseClient, game: LeagueGameRow): Promise<boolean> {
  const gameIds = [game.home_game_id, game.away_game_id].filter((id): id is string => Boolean(id));
  if (gameIds.length === 0) return false;
  const { count, error } = await db.from('game_events').select('id', { count: 'exact', head: true }).in('game_id', gameIds);
  if (error) throw error;
  return (count ?? 0) > 0;
}

async function loadResultRow(db: SupabaseClient, leagueGameId: string): Promise<ResultRow | null> {
  const { data, error } = await db.from('league_game_manual_results').select('*').eq('league_game_id', leagueGameId).maybeSingle();
  if (error) throw error;
  return (data as ResultRow | null) ?? null;
}

async function loadRosters(db: SupabaseClient, game: LeagueGameRow): Promise<ManualResultRoster[]> {
  const { data, error } = await db
    .from('players')
    .select('id, team_id, first_name, last_name, jersey_number')
    .in('team_id', [game.home_team_id, game.away_team_id])
    .eq('is_active', true)
    .order('last_name');
  if (error) throw error;
  const rows = (data ?? []) as { id: string; team_id: string; first_name: string; last_name: string; jersey_number: number | null }[];
  return [game.home_team_id, game.away_team_id].map((teamId) => ({
    teamId,
    players: rows
      .filter((row) => row.team_id === teamId)
      .map((row) => ({ id: row.id, name: `${row.first_name} ${row.last_name}`.trim(), jersey: row.jersey_number })),
  }));
}

function toInput(row: ResultRow, lines: LineRow[]): ManualResultInput | null {
  const leagueGameId = row.league_game_id;
  if (row.kind === 'final') return { kind: 'final', leagueGameId, homeRuns: row.home_runs, awayRuns: row.away_runs };
  if (row.kind === 'forfeit') {
    return row.forfeit_winner_team_id ? { kind: 'forfeit', leagueGameId, winnerTeamId: row.forfeit_winner_team_id } : null;
  }
  const box = {
    leagueGameId,
    homeInningRuns: row.home_inning_runs ?? [],
    awayInningRuns: row.away_inning_runs ?? [],
    homeHits: row.home_hits ?? 0,
    awayHits: row.away_hits ?? 0,
    homeErrors: row.home_errors ?? 0,
    awayErrors: row.away_errors ?? 0,
  };
  if (row.kind === 'box') return { kind: 'box', ...box };
  return {
    kind: 'batting',
    ...box,
    lines: lines.map((line) => ({
      teamId: line.team_id,
      playerId: line.player_id,
      ab: line.ab,
      r: line.r,
      h: line.h,
      doubles: line.doubles,
      triples: line.triples,
      hr: line.hr,
      rbi: line.rbi,
      bb: line.bb,
      so: line.so,
      hbp: line.hbp,
      sf: line.sf,
      sb: line.sb,
    })),
  };
}

/** The actor may change this entry: an admin always, a coach unless an admin made it. */
async function mayEdit(db: SupabaseClient, game: LeagueGameRow, powers: Powers, existing: ResultRow | null): Promise<boolean> {
  if (powers.isLeagueAdmin) return true;
  if (!powers.isTeamCoach) return false;
  if (!existing) return true;
  return !(await isActiveLeagueAdmin(db, game.league_id, existing.entered_by));
}

function failed<T>(action: string, context: string, actorUserId: string, error: unknown): ServiceResult<T> {
  console.error(`[league-manual-result] ${action} failed ${context} actor=${actorUserId}:`, error);
  return serviceError('failed', GENERIC_FAILURE);
}

export async function loadManualResult(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<LoadedManualResult>> {
  const parsed = leagueGameIdInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { leagueGameId } = parsed.data;
  const context = `league_game=${leagueGameId}`;

  try {
    const game = await loadLeagueGame(db, leagueGameId);
    if (!game) return serviceError('not_found', NOT_FOUND);
    const powers = await loadPowers(db, game, actorUserId);
    if (!powers.isLeagueStaff && !powers.onEitherTeam) return serviceError('not_found', NOT_FOUND);

    const existing = await loadResultRow(db, leagueGameId);
    let lines: LineRow[] = [];
    if (existing?.kind === 'batting') {
      const { data, error } = await db.from('league_game_manual_batting_lines').select('*').eq('league_game_id', leagueGameId);
      if (error) throw error;
      lines = (data ?? []) as LineRow[];
    }
    const [rosters, edit, scoredInApp] = await Promise.all([
      loadRosters(db, game),
      mayEdit(db, game, powers, existing),
      hasEvents(db, game),
    ]);
    return serviceOk({
      result: existing ? toInput(existing, lines) : null,
      rosters,
      canEdit: edit && !scoredInApp,
    });
  } catch (error) {
    return failed('load', context, actorUserId, error);
  }
}

/** Reasons a batting line cannot be saved; null when every line is on one of the teams' rosters. */
async function lineProblem(db: SupabaseClient, game: LeagueGameRow, lines: ManualBattingLineInput[]): Promise<string | null> {
  const teams = [game.home_team_id, game.away_team_id];
  if (lines.some((line) => !teams.includes(line.teamId))) return 'Batting lines must belong to the home or away team.';
  if (lines.length === 0) return null;
  const { data, error } = await db
    .from('players')
    .select('id, team_id')
    .in('id', lines.map((line) => line.playerId));
  if (error) throw error;
  const teamOf = new Map(((data ?? []) as { id: string; team_id: string | null }[]).map((player) => [player.id, player.team_id]));
  if (lines.some((line) => teamOf.get(line.playerId) !== line.teamId)) {
    return 'Every batting line needs a player on that team’s roster.';
  }
  return null;
}

function resultRowFor(input: ManualResultInput, game: LeagueGameRow, actorUserId: string, now: string): Record<string, unknown> {
  const base = { league_game_id: game.id, kind: input.kind, entered_by: actorUserId, entered_at: now, updated_at: now };
  const empty = {
    home_inning_runs: null,
    away_inning_runs: null,
    home_hits: null,
    away_hits: null,
    home_errors: null,
    away_errors: null,
    forfeit_winner_team_id: null,
  };
  if (input.kind === 'final') return { ...base, ...empty, home_runs: input.homeRuns, away_runs: input.awayRuns };
  // A forfeit adds no runs; the standings logic gives the winner the win.
  if (input.kind === 'forfeit') return { ...base, ...empty, home_runs: 0, away_runs: 0, forfeit_winner_team_id: input.winnerTeamId };
  return {
    ...base,
    home_runs: sum(input.homeInningRuns),
    away_runs: sum(input.awayInningRuns),
    home_inning_runs: input.homeInningRuns,
    away_inning_runs: input.awayInningRuns,
    home_hits: input.homeHits,
    away_hits: input.awayHits,
    home_errors: input.homeErrors,
    away_errors: input.awayErrors,
    forfeit_winner_team_id: null,
  };
}

export async function enterManualResult(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<{ leagueGameId: string }>> {
  const parsed = manualResultInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const input = parsed.data;
  const leagueGameId = input.leagueGameId;
  const context = `league_game=${leagueGameId}`;

  try {
    const game = await loadLeagueGame(db, leagueGameId);
    if (!game) return serviceError('not_found', NOT_FOUND);
    const powers = await loadPowers(db, game, actorUserId);
    if (!powers.isLeagueAdmin && !powers.isTeamCoach) {
      // League managers and players see the game but may not enter results.
      if (!powers.isLeagueStaff && !powers.onEitherTeam) return serviceError('not_found', NOT_FOUND);
      return serviceError('forbidden', 'You can not enter results for this game.');
    }
    if (await hasEvents(db, game)) return serviceError('conflict', SCORED_IN_APP);

    const existing = await loadResultRow(db, leagueGameId);
    if (!(await mayEdit(db, game, powers, existing))) {
      return serviceError('forbidden', 'A league admin entered this result; only a league admin can change it.');
    }

    if (input.kind === 'forfeit' && ![game.home_team_id, game.away_team_id].includes(input.winnerTeamId)) {
      return serviceError('invalid', 'The forfeit winner must be the home or away team.');
    }
    if (input.kind === 'batting') {
      const problem = await lineProblem(db, game, input.lines);
      if (problem) return serviceError('invalid', problem);
    }

    const now = new Date().toISOString();
    const { error: upsertError } = await db
      .from('league_game_manual_results')
      .upsert(resultRowFor(input, game, actorUserId, now), { onConflict: 'league_game_id' });
    if (upsertError) return failed('result upsert', context, actorUserId, upsertError);

    const { error: deleteError } = await db.from('league_game_manual_batting_lines').delete().eq('league_game_id', leagueGameId);
    if (deleteError) return failed('lines delete', context, actorUserId, deleteError);
    if (input.kind === 'batting' && input.lines.length > 0) {
      const { error: insertError } = await db.from('league_game_manual_batting_lines').insert(
        input.lines.map((line) => ({
          league_game_id: leagueGameId,
          team_id: line.teamId,
          player_id: line.playerId,
          ab: line.ab,
          r: line.r,
          h: line.h,
          doubles: line.doubles,
          triples: line.triples,
          hr: line.hr,
          rbi: line.rbi,
          bb: line.bb,
          so: line.so,
          hbp: line.hbp,
          sf: line.sf,
          sb: line.sb,
        })),
      );
      if (insertError) return failed('lines insert', context, actorUserId, insertError);
    }
  } catch (error) {
    return failed('enter', context, actorUserId, error);
  }

  // The result is saved; a refresh problem must not turn it into a failure.
  try {
    await refreshLeagueGame(db, leagueGameId, actorUserId);
  } catch (error) {
    console.error(`[league-manual-result] refresh failed ${context} actor=${actorUserId}:`, error);
  }
  return serviceOk({ leagueGameId });
}

/** The league's regulation innings, which sets the box score's minimum columns. */
export async function loadLeagueMaxInnings(db: SupabaseClient, leagueId: string): Promise<number> {
  const { data } = await db.from('leagues').select('scoring_settings').eq('id', leagueId).maybeSingle();
  return mergeWithDefaults((data as { scoring_settings: unknown } | null)?.scoring_settings ?? {}).gameLength.maxInnings;
}
