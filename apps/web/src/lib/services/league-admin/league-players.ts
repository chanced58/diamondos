import type { SupabaseClient } from '@supabase/supabase-js';
import {
  getLeagueDivisions,
  getLeaguePlayers,
  getLeagueTeamsAll,
  getPlayerTransfers,
  type LeaguePlayerRow,
} from '@baseball/database';
import {
  createLeaguePlayerSchema,
  leagueAdminInputSchema,
  leagueAdminPlayerInputSchema,
  releasePlayerSchema,
  transferPlayerSchema,
  type LeagueAdminPlayer,
  type LeagueAdminTeam,
  type LeaguePlayerCreatedResponse,
  type LeaguePlayerDetailResponse,
  type LeaguePlayersResponse,
  type ReleaseLeaguePlayerResponse,
  type TransferLeaguePlayerResponse,
} from '@baseball/shared';
import { authorizeLeagueStaff } from './authorize';
import { invalidInput, serviceError, serviceOk, type ServiceResult } from '../result';

/**
 * League players (the web /league/admin/players pages), shared by their
 * actions and the mobile `/api/m/v1/league-admin/:leagueId/players` routes.
 * League staff read; league admins register, assign, trade and release
 * players through `fn_create_league_player`, `fn_transfer_player` and
 * `fn_release_player`, which keep `player_team_memberships`, `players.team_id`
 * and the `player_transfers` log in step. Those RPCs are service-role only and
 * trust `p_actor`, so the actor is always the authenticated user.
 */

const ADMIN_ONLY = 'Only league admins can manage league players.';
const UNIQUE_VIOLATION = '23505';

function failed<T>(action: string, leagueId: string, actorUserId: string, error: unknown): ServiceResult<T> {
  console.error(`[league-players] ${action} failed league=${leagueId} actor=${actorUserId}:`, error);
  return serviceError('failed', 'Something went wrong. Please try again.');
}

/** The RPCs' coded exceptions as service errors; anything else fails. */
function rpcFailure<T>(action: string, leagueId: string, actorUserId: string, error: { message?: string; code?: string }): ServiceResult<T> {
  const message = error.message ?? '';
  if (message.startsWith('IN_PROGRESS_GAME:')) {
    return serviceError('conflict', 'This player is in a game in progress. Finalize the game first.');
  }
  switch (message) {
    case 'FORBIDDEN':
      return serviceError('forbidden', ADMIN_ONLY);
    case 'NOT_IN_LEAGUE':
      return serviceError('not_found', 'That player isn’t registered in this league.');
    case 'TEAM_NOT_IN_LEAGUE':
      return serviceError('invalid', 'Pick an active team in this league.');
    case 'TO_TEAM_REQUIRED':
      return serviceError('invalid', 'Pick a team.');
    case 'NOT_ON_TEAM':
      return serviceError('conflict', 'That player is already a free agent.');
  }
  if (error.code === UNIQUE_VIOLATION) {
    return serviceError('conflict', 'That jersey number is already taken on the team. Pick another or leave it blank.');
  }
  return failed(action, leagueId, actorUserId, error);
}

function toPlayer(row: LeaguePlayerRow): LeagueAdminPlayer {
  return {
    playerId: row.player.id,
    firstName: row.player.first_name,
    lastName: row.player.last_name,
    jerseyNumber: row.player.jersey_number,
    primaryPosition: row.player.primary_position,
    teamId: row.player.team_id,
    teamName: row.player.team?.name ?? null,
  };
}

/** The league's active platform teams, which players can be assigned to (opponent teams can't). */
async function rosterTeams(db: SupabaseClient, leagueId: string): Promise<LeagueAdminTeam[]> {
  const members = await getLeagueTeamsAll(db, leagueId);
  return members
    .filter((member) => member.team_id && !member.opponent_team_id && member.is_active)
    .map((member) => ({ teamId: member.team_id as string, name: member.teams?.name ?? 'Unknown', divisionId: member.division_id }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function loadLeaguePlayers(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<LeaguePlayersResponse>> {
  const parsed = leagueAdminInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { leagueId } = parsed.data;

  const access = await authorizeLeagueStaff(db, actorUserId, leagueId, { requireAdmin: false });
  if (!access.ok) return access;

  try {
    const [players, teams, divisions] = await Promise.all([
      getLeaguePlayers(db, leagueId),
      rosterTeams(db, leagueId),
      getLeagueDivisions(db, leagueId),
    ]);
    return serviceOk({
      league: access.data.league,
      canEdit: access.data.isLeagueAdmin,
      players: players.map(toPlayer),
      teams,
      divisions: divisions.map((division) => ({ id: division.id, name: division.name })),
    });
  } catch (error) {
    return failed('loadLeaguePlayers', leagueId, actorUserId, error);
  }
}

export async function loadLeaguePlayer(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<LeaguePlayerDetailResponse>> {
  const parsed = leagueAdminPlayerInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { leagueId, playerId } = parsed.data;

  const access = await authorizeLeagueStaff(db, actorUserId, leagueId, { requireAdmin: false });
  if (!access.ok) return access;

  // Only a player registered in this league, never another league's.
  const { data: registration, error: registrationError } = await db
    .from('league_players')
    .select('player_id')
    .eq('league_id', leagueId)
    .eq('player_id', playerId)
    .maybeSingle();
  if (registrationError) return failed('loadLeaguePlayer', leagueId, actorUserId, registrationError);
  if (!registration) return serviceError('not_found', 'Player not found.');

  const { data: row, error: playerError } = await db
    .from('players')
    .select('id, first_name, last_name, jersey_number, date_of_birth, primary_position, bats, throws, graduation_year, team_id, team:teams(id, name)')
    .eq('id', playerId)
    .maybeSingle();
  if (playerError) return failed('loadLeaguePlayer', leagueId, actorUserId, playerError);
  if (!row) return serviceError('not_found', 'Player not found.');

  type PlayerRow = {
    id: string;
    first_name: string;
    last_name: string;
    jersey_number: number | null;
    date_of_birth: string | null;
    primary_position: string | null;
    bats: string | null;
    throws: string | null;
    graduation_year: number | null;
    team_id: string | null;
    team: { id: string; name: string } | { id: string; name: string }[] | null;
  };
  const player = row as unknown as PlayerRow;
  const team = Array.isArray(player.team) ? player.team[0] : player.team;

  try {
    const [transfers, teams] = await Promise.all([getPlayerTransfers(db, playerId), rosterTeams(db, leagueId)]);
    return serviceOk({
      canEdit: access.data.isLeagueAdmin,
      player: {
        playerId: player.id,
        firstName: player.first_name,
        lastName: player.last_name,
        jerseyNumber: player.jersey_number,
        primaryPosition: player.primary_position,
        teamId: player.team_id,
        teamName: team?.name ?? null,
        dateOfBirth: player.date_of_birth,
        bats: player.bats,
        throws: player.throws,
        graduationYear: player.graduation_year,
      },
      transfers: transfers.map((transfer) => ({
        id: transfer.id,
        type: transfer.transfer_type,
        fromTeamName: transfer.from_team?.name ?? null,
        toTeamName: transfer.to_team?.name ?? null,
        transferredAt: transfer.transferred_at,
        reason: transfer.reason,
      })),
      teams,
    });
  } catch (error) {
    return failed('loadLeaguePlayer', leagueId, actorUserId, error);
  }
}

/** Registers a new player in the league, as a free agent or on one of its teams. */
export async function createLeaguePlayer(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<LeaguePlayerCreatedResponse>> {
  const parsed = createLeaguePlayerSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const input = parsed.data;

  const access = await authorizeLeagueStaff(db, actorUserId, input.leagueId, { requireAdmin: true, forbiddenMessage: ADMIN_ONLY });
  if (!access.ok) return access;

  const { data, error } = await db.rpc('fn_create_league_player', {
    p_league_id: input.leagueId,
    p_first_name: input.firstName,
    p_last_name: input.lastName,
    p_date_of_birth: input.dateOfBirth ?? null,
    p_jersey_number: input.jerseyNumber ?? null,
    p_primary_position: input.primaryPosition ?? null,
    p_bats: input.bats ?? null,
    p_throws: input.throws ?? null,
    p_graduation_year: input.graduationYear ?? null,
    p_notes: input.notes ?? null,
    p_team_id: input.teamId ?? null,
    p_actor: actorUserId,
  });
  if (error) return rpcFailure('createLeaguePlayer', input.leagueId, actorUserId, error);
  return serviceOk({ playerId: (data as { id: string }).id });
}

/**
 * Assigns a free agent to a team or trades a player to another. When their
 * jersey number is taken there, nothing moves and the conflict comes back
 * for the admin to confirm with `acceptJerseyClear`, which clears it.
 */
export async function transferLeaguePlayer(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<TransferLeaguePlayerResponse>> {
  const parsed = transferPlayerSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const input = parsed.data;

  const access = await authorizeLeagueStaff(db, actorUserId, input.leagueId, { requireAdmin: true, forbiddenMessage: ADMIN_ONLY });
  if (!access.ok) return access;

  const { data, error } = await db.rpc('fn_transfer_player', {
    p_league_id: input.leagueId,
    p_player_id: input.playerId,
    p_to_team_id: input.toTeamId,
    p_effective_at: input.effectiveAt ?? null,
    p_reason: input.reason ?? null,
    p_season_id: input.seasonId ?? null,
    p_accept_jersey_clear: input.acceptJerseyClear,
    p_actor: actorUserId,
  });
  if (error) {
    const message = (error as { message?: string }).message ?? '';
    if (message.startsWith('JERSEY_CONFLICT:')) {
      const { data: player } = await db.from('players').select('jersey_number').eq('id', input.playerId).maybeSingle();
      return serviceOk({
        status: 'jersey_conflict',
        jerseyNumber: (player as { jersey_number: number | null } | null)?.jersey_number ?? null,
        conflictingPlayerName: message.replace(/^JERSEY_CONFLICT:\s*/, '') || 'another player',
      });
    }
    return rpcFailure('transferLeaguePlayer', input.leagueId, actorUserId, error);
  }
  return serviceOk({ status: 'moved', transferId: (data as { id: string }).id });
}

/** Moves a player off their team into the league's free-agent pool; their stats stay with the team. */
export async function releaseLeaguePlayer(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<ReleaseLeaguePlayerResponse>> {
  const parsed = releasePlayerSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const input = parsed.data;

  const access = await authorizeLeagueStaff(db, actorUserId, input.leagueId, { requireAdmin: true, forbiddenMessage: ADMIN_ONLY });
  if (!access.ok) return access;

  const { data, error } = await db.rpc('fn_release_player', {
    p_league_id: input.leagueId,
    p_player_id: input.playerId,
    p_effective_at: input.effectiveAt ?? null,
    p_reason: input.reason ?? null,
    p_actor: actorUserId,
  });
  if (error) return rpcFailure('releaseLeaguePlayer', input.leagueId, actorUserId, error);
  return serviceOk({ transferId: (data as { id: string }).id });
}
