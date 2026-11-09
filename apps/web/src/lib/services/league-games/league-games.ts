import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createLeagueGameInputSchema,
  leagueGameIdInputSchema,
  listLeagueGamesInputSchema,
  updateLeagueGameInputSchema,
  utcToZonedDateTime,
  zonedDateTimeToUtc,
} from '@baseball/shared';
import { authorizeLeagueStaff } from '../league-admin/authorize';
import { invalidInput, serviceError, serviceOk, type ServiceResult } from '../result';
import { ensureTeamSeason } from './ensure-team-season';

/**
 * A league's scheduled games. A league game is one matchup between two of the
 * league's teams: a `league_games` row plus one team-owned `games` row per
 * team (each pointing at the other team's league roster record), so both
 * teams score and see it. League admins create, edit and cancel; any league
 * staff list. Shared by the web actions and the mobile `/api/m/v1` routes.
 */

const ADMIN_ONLY = 'Only league admins can change league games.';

export interface LeagueGameListItem {
  id: string;
  season: string;
  scheduledAt: string;
  timeZone: string | null;
  venueName: string | null;
  status: string;
  home: { teamId: string; name: string; gameId: string | null };
  away: { teamId: string; name: string; gameId: string | null };
  homeRuns: number | null;
  awayRuns: number | null;
  hasManualResult: boolean;
  needsSettling: boolean;
}

function failed<T>(action: string, context: string, actorUserId: string, error: unknown): ServiceResult<T> {
  console.error(`[league-games] ${action} failed ${context} actor=${actorUserId}:`, error);
  return serviceError('failed', 'Something went wrong. Please try again.');
}

// ── Create ───────────────────────────────────────────────────────────────────

export async function createLeagueGame(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<{ leagueGameId: string; homeGameId: string; awayGameId: string }>> {
  const parsed = createLeagueGameInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const input = parsed.data;
  const { leagueId, homeTeamId, awayTeamId } = input;
  const context = `league=${leagueId} home=${homeTeamId} away=${awayTeamId}`;

  const access = await authorizeLeagueStaff(db, actorUserId, leagueId, {
    requireAdmin: true,
    forbiddenMessage: ADMIN_ONLY,
  });
  if (!access.ok) return access;

  let scheduledAt: string;
  try {
    scheduledAt = zonedDateTimeToUtc(input.date, input.time, input.timeZone);
  } catch {
    return serviceError('invalid', 'That date and time is not valid.');
  }

  const createdGameIds: string[] = [];
  let leagueGameId: string | null = null;
  try {
    const { data: league, error: leagueError } = await db
      .from('leagues')
      .select('current_season')
      .eq('id', leagueId)
      .maybeSingle();
    if (leagueError) throw leagueError;
    const season = (league?.current_season as string | null | undefined)?.trim();
    if (!season) return serviceError('invalid', "Set the league's current season first.");

    const { data: members, error: membersError } = await db
      .from('league_members')
      .select('team_id')
      .eq('league_id', leagueId)
      .eq('is_active', true)
      .in('team_id', [homeTeamId, awayTeamId]);
    if (membersError) throw membersError;
    const memberTeamIds = new Set((members ?? []).map((row: { team_id: string }) => row.team_id));
    if (!memberTeamIds.has(homeTeamId) || !memberTeamIds.has(awayTeamId)) {
      return serviceError('invalid', 'Both teams must be active teams in the league.');
    }

    const [teamsResult, rosterResult] = await Promise.all([
      db.from('teams').select('id, name').in('id', [homeTeamId, awayTeamId]),
      db
        .from('opponent_teams')
        .select('id, linked_team_id')
        .eq('league_id', leagueId)
        .in('linked_team_id', [homeTeamId, awayTeamId]),
    ]);
    if (teamsResult.error) throw teamsResult.error;
    if (rosterResult.error) throw rosterResult.error;
    const teamName = new Map<string, string>(
      (teamsResult.data ?? []).map((row: { id: string; name: string }) => [row.id, row.name]),
    );
    const rosterRecord = new Map<string, string>(
      (rosterResult.data ?? []).map((row: { id: string; linked_team_id: string }) => [row.linked_team_id, row.id]),
    );
    const homeRecord = rosterRecord.get(homeTeamId);
    const awayRecord = rosterRecord.get(awayTeamId);
    if (!homeRecord || !awayRecord) {
      return failed('createLeagueGame', `${context} (missing league roster record)`, actorUserId, new Error('opponent_teams record missing for a league team'));
    }

    const [homeSeasonId, awaySeasonId] = await Promise.all([
      ensureTeamSeason(db, homeTeamId, season, input.date),
      ensureTeamSeason(db, awayTeamId, season, input.date),
    ]);

    const { data: leagueGame, error: leagueGameError } = await db
      .from('league_games')
      .insert({
        league_id: leagueId,
        season,
        home_team_id: homeTeamId,
        away_team_id: awayTeamId,
        scheduled_at: scheduledAt,
        time_zone: input.timeZone,
        venue_name: input.venueName ?? null,
        status: 'scheduled',
        created_by: actorUserId,
      })
      .select('id')
      .single();
    if (leagueGameError || !leagueGame) throw leagueGameError ?? new Error('league_games insert returned no row');
    leagueGameId = leagueGame.id as string;

    const shared = {
      scheduled_at: scheduledAt,
      time_zone: input.timeZone,
      venue_name: input.venueName ?? null,
      neutral_home_team: null,
      status: 'scheduled',
      created_by: actorUserId,
      league_game_id: leagueGameId,
    };

    // The partial unique index on paired_game_id means the home row goes in
    // unpaired, the away row points at it, and the home row is back-linked.
    const { data: home, error: homeError } = await db
      .from('games')
      .insert({
        ...shared,
        team_id: homeTeamId,
        season_id: homeSeasonId,
        opponent_team_id: awayRecord,
        opponent_name: teamName.get(awayTeamId) ?? null,
        location_type: 'home',
        scorer_side: 'home',
        paired_game_id: null,
      })
      .select('id')
      .single();
    if (homeError || !home) throw homeError ?? new Error('home game insert returned no row');
    createdGameIds.push(home.id as string);

    const { data: away, error: awayError } = await db
      .from('games')
      .insert({
        ...shared,
        team_id: awayTeamId,
        season_id: awaySeasonId,
        opponent_team_id: homeRecord,
        opponent_name: teamName.get(homeTeamId) ?? null,
        location_type: 'away',
        scorer_side: 'away',
        paired_game_id: home.id,
      })
      .select('id')
      .single();
    if (awayError || !away) throw awayError ?? new Error('away game insert returned no row');
    createdGameIds.push(away.id as string);

    const { error: pairError } = await db.from('games').update({ paired_game_id: away.id }).eq('id', home.id);
    if (pairError) throw pairError;

    const { error: linkError } = await db
      .from('league_games')
      .update({ home_game_id: home.id, away_game_id: away.id })
      .eq('id', leagueGameId);
    if (linkError) throw linkError;

    return serviceOk({ leagueGameId, homeGameId: home.id as string, awayGameId: away.id as string });
  } catch (error) {
    await rollbackCreate(db, leagueGameId, createdGameIds);
    return failed('createLeagueGame', context, actorUserId, error);
  }
}

/**
 * Best-effort removal of a half-created matchup; the pairing columns go first so deletes are not blocked.
 * supabase-js returns `{ error }` rather than throwing, so each step's error is logged and the rest still run.
 */
async function rollbackCreate(db: SupabaseClient, leagueGameId: string | null, gameIds: string[]): Promise<void> {
  const context = `league_game=${leagueGameId} games=${gameIds.join(',')}`;
  const log = (step: string, error: unknown) => {
    if (error) console.error(`[league-games] rollback ${step} failed ${context}:`, error);
  };
  try {
    if (gameIds.length > 0) {
      log('unpair', (await db.from('games').update({ paired_game_id: null }).in('id', gameIds)).error);
      log('delete games', (await db.from('games').delete().in('id', gameIds)).error);
    }
    if (leagueGameId) {
      log('delete league game', (await db.from('league_games').delete().eq('id', leagueGameId)).error);
    }
  } catch (error) {
    log('step', error);
  }
}

// ── Edit and cancel ──────────────────────────────────────────────────────────

interface LeagueGameRow {
  id: string;
  league_id: string;
  status: string;
  scheduled_at: string;
  time_zone: string | null;
  home_game_id: string | null;
  away_game_id: string | null;
}

async function loadAdminLeagueGame(
  db: SupabaseClient,
  actorUserId: string,
  leagueGameId: string,
): Promise<ServiceResult<LeagueGameRow>> {
  const { data, error } = await db
    .from('league_games')
    .select('id, league_id, status, scheduled_at, time_zone, home_game_id, away_game_id')
    .eq('id', leagueGameId)
    .maybeSingle();
  if (error) return failed('loadLeagueGame', `league_game=${leagueGameId}`, actorUserId, error);
  if (!data) return serviceError('not_found', 'Game not found.');
  const row = data as LeagueGameRow;
  const access = await authorizeLeagueStaff(db, actorUserId, row.league_id, {
    requireAdmin: true,
    forbiddenMessage: ADMIN_ONLY,
  });
  if (!access.ok) return access;
  return serviceOk(row);
}

function teamGameIds(row: LeagueGameRow): string[] {
  return [row.home_game_id, row.away_game_id].filter((id): id is string => id !== null);
}

export async function updateLeagueGame(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<{ leagueGameId: string }>> {
  const parsed = updateLeagueGameInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const input = parsed.data;

  const loaded = await loadAdminLeagueGame(db, actorUserId, input.leagueGameId);
  if (!loaded.ok) return loaded;
  const row = loaded.data;
  if (row.status === 'completed') return serviceError('conflict', 'A completed game cannot be edited.');
  if (row.status === 'cancelled') return serviceError('conflict', 'A cancelled game cannot be edited.');

  const changes: Record<string, unknown> = {};
  if (input.date !== undefined || input.time !== undefined || input.timeZone !== undefined) {
    const zone = input.timeZone ?? row.time_zone ?? undefined;
    const current = utcToZonedDateTime(row.scheduled_at, zone);
    try {
      changes.scheduled_at = zonedDateTimeToUtc(input.date ?? current.date, input.time ?? current.time, zone ?? 'UTC');
    } catch {
      return serviceError('invalid', 'That date and time is not valid.');
    }
    changes.time_zone = zone ?? 'UTC';
  }
  if (input.venueName !== undefined) changes.venue_name = input.venueName;
  if (Object.keys(changes).length === 0) return serviceOk({ leagueGameId: row.id });

  const { error: leagueGameError } = await db.from('league_games').update(changes).eq('id', row.id);
  if (leagueGameError) return failed('updateLeagueGame', `league_game=${row.id}`, actorUserId, leagueGameError);

  const gameIds = teamGameIds(row);
  if (gameIds.length > 0) {
    const { error: gamesError } = await db.from('games').update(changes).in('id', gameIds);
    if (gamesError) return failed('updateLeagueGame games', `league_game=${row.id}`, actorUserId, gamesError);
  }
  return serviceOk({ leagueGameId: row.id });
}

export async function cancelLeagueGame(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<{ leagueGameId: string }>> {
  const parsed = leagueGameIdInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);

  const loaded = await loadAdminLeagueGame(db, actorUserId, parsed.data.leagueGameId);
  if (!loaded.ok) return loaded;
  const row = loaded.data;

  const { error: leagueGameError } = await db.from('league_games').update({ status: 'cancelled' }).eq('id', row.id);
  if (leagueGameError) return failed('cancelLeagueGame', `league_game=${row.id}`, actorUserId, leagueGameError);

  const gameIds = teamGameIds(row);
  if (gameIds.length > 0) {
    const { error: gamesError } = await db.from('games').update({ status: 'cancelled' }).in('id', gameIds);
    if (gamesError) return failed('cancelLeagueGame games', `league_game=${row.id}`, actorUserId, gamesError);
  }
  return serviceOk({ leagueGameId: row.id });
}

// ── List ─────────────────────────────────────────────────────────────────────

interface ListedLeagueGame {
  id: string;
  season: string;
  scheduled_at: string;
  time_zone: string | null;
  venue_name: string | null;
  status: string;
  home_team_id: string;
  away_team_id: string;
  home_game_id: string | null;
  away_game_id: string | null;
}

export async function listLeagueGames(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<{ games: LeagueGameListItem[] }>> {
  const parsed = listLeagueGamesInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { leagueId, season } = parsed.data;

  const access = await authorizeLeagueStaff(db, actorUserId, leagueId, { requireAdmin: false });
  if (!access.ok) return access;

  try {
    let query = db
      .from('league_games')
      .select('id, season, scheduled_at, time_zone, venue_name, status, home_team_id, away_team_id, home_game_id, away_game_id')
      .eq('league_id', leagueId);
    if (season) query = query.eq('season', season);
    const { data, error } = await query.order('scheduled_at', { ascending: true });
    if (error) throw error;
    const rows = (data ?? []) as ListedLeagueGame[];
    if (rows.length === 0) return serviceOk({ games: [] });

    const teamIds = [...new Set(rows.flatMap((row) => [row.home_team_id, row.away_team_id]))];
    const leagueGameIds = rows.map((row) => row.id);
    const completedHomeGameIds = rows
      .filter((row) => row.status === 'completed' && row.home_game_id)
      .map((row) => row.home_game_id as string);
    const homeGameIds = rows.map((row) => row.home_game_id).filter((id): id is string => id !== null);

    const [teams, scores, reconciliations, manualResults] = await Promise.all([
      db.from('teams').select('id, name').in('id', teamIds),
      db.from('games').select('id, home_score, away_score').in('id', completedHomeGameIds),
      db.from('game_reconciliations').select('home_game_id, conflicts, resolved_at').in('home_game_id', homeGameIds),
      db.from('league_game_manual_results').select('league_game_id').in('league_game_id', leagueGameIds),
    ]);
    for (const result of [teams, scores, reconciliations, manualResults]) {
      if (result.error) throw result.error;
    }

    const names = new Map<string, string>((teams.data ?? []).map((t: { id: string; name: string }) => [t.id, t.name]));
    const runs = new Map<string, { home: number; away: number }>(
      (scores.data ?? []).map((g: { id: string; home_score: number; away_score: number }) => [
        g.id,
        { home: g.home_score, away: g.away_score },
      ]),
    );
    const needsSettling = new Set<string>(
      (reconciliations.data ?? [])
        .filter(
          (r: { conflicts: unknown; resolved_at: string | null }) =>
            Array.isArray(r.conflicts) && r.conflicts.length > 0 && r.resolved_at === null,
        )
        .map((r: { home_game_id: string }) => r.home_game_id),
    );
    const manual = new Set<string>((manualResults.data ?? []).map((r: { league_game_id: string }) => r.league_game_id));

    const games = rows.map((row): LeagueGameListItem => {
      const score = row.status === 'completed' && row.home_game_id ? runs.get(row.home_game_id) : undefined;
      return {
        id: row.id,
        season: row.season,
        scheduledAt: row.scheduled_at,
        timeZone: row.time_zone,
        venueName: row.venue_name,
        status: row.status,
        home: { teamId: row.home_team_id, name: names.get(row.home_team_id) ?? 'Unknown', gameId: row.home_game_id },
        away: { teamId: row.away_team_id, name: names.get(row.away_team_id) ?? 'Unknown', gameId: row.away_game_id },
        homeRuns: score?.home ?? null,
        awayRuns: score?.away ?? null,
        hasManualResult: manual.has(row.id),
        needsSettling: row.home_game_id ? needsSettling.has(row.home_game_id) : false,
      };
    });
    return serviceOk({ games });
  } catch (error) {
    return failed('listLeagueGames', `league=${leagueId}`, actorUserId, error);
  }
}
