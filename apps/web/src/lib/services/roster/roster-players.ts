import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createRosterPlayerInputSchema,
  deactivateRosterPlayerInputSchema,
  reactivateRosterPlayerInputSchema,
  rosterPlayerIdInputSchema,
  updateRosterPlayerInputSchema,
  type CreateRosterPlayerResponse,
  type RosterPlayer,
  type RosterPlayerFields,
  type RosterPlayerResponse,
  type RosterPlayerWriteResponse,
} from '@baseball/shared';
import { getPlayerAccess, getRosterAccess } from '@/lib/roster-access';
import { invalidInput, serviceError, serviceOk, type ServiceResult } from '../result';
import { invitePlayerToApp } from '../members/team-invitations';

/**
 * A team's roster players (the web /teams/:teamId/roster pages), shared by the
 * web actions and the mobile `/api/m/v1/teams/:teamId/players` routes.
 *
 * Those who may open a player's page read them (`getPlayerAccess`); roster
 * managers (`getRosterAccess`: coaches, platform admins, admins of the team's
 * league) add, edit, deactivate and reactivate them. A player's active `player_team_memberships` row carries the
 * jersey number the team's unique index guards, so each write changes the
 * membership first: a taken number fails as `conflict` before the player row
 * changes, and a failed player write puts the membership back.
 */

const UNIQUE_VIOLATION = '23505';
const PLAYER_COLUMNS =
  'id, team_id, first_name, last_name, jersey_number, primary_position, secondary_positions, bats, throws, graduation_year, email, phone, is_active, disabled_at';

type PlayerRow = {
  id: string;
  team_id: string;
  first_name: string;
  last_name: string;
  jersey_number: number | null;
  primary_position: string | null;
  secondary_positions: string[] | null;
  bats: string | null;
  throws: string | null;
  graduation_year: number | null;
  email: string | null;
  phone: string | null;
  is_active: boolean;
  disabled_at: string | null;
};

type DbError = { code?: string; message: string };

function failed<T>(action: string, teamId: string, playerId: string | null, actorUserId: string, error: unknown): ServiceResult<T> {
  console.error(`[roster] ${action} failed team=${teamId} player=${playerId ?? '-'} actor=${actorUserId}:`, error);
  return serviceError('failed', 'Something went wrong. Please try again.');
}

function jerseyTaken<T>(jerseyNumber: number | null): ServiceResult<T> {
  return serviceError('conflict', `Jersey #${jerseyNumber} is already taken on this team.`);
}

function toPlayer(row: PlayerRow): RosterPlayer {
  return {
    id: row.id,
    teamId: row.team_id,
    firstName: row.first_name,
    lastName: row.last_name,
    jerseyNumber: row.jersey_number,
    primaryPosition: row.primary_position,
    secondaryPositions: row.secondary_positions ?? [],
    bats: row.bats,
    throws: row.throws,
    graduationYear: row.graduation_year,
    email: row.email,
    phone: row.phone,
    isActive: row.is_active,
    disabledAt: row.disabled_at,
  };
}

function toColumns(fields: RosterPlayerFields) {
  return {
    first_name: fields.firstName,
    last_name: fields.lastName,
    jersey_number: fields.jerseyNumber,
    primary_position: fields.primaryPosition,
    secondary_positions: fields.secondaryPositions,
    bats: fields.bats,
    throws: fields.throws,
    graduation_year: fields.graduationYear,
    email: fields.email,
    phone: fields.phone,
  };
}

/** Roster managers only; a viewer who can't manage is refused, anyone else learns nothing. */
async function authorizeManager(db: SupabaseClient, actorUserId: string, teamId: string): Promise<ServiceResult<null>> {
  const access = await getRosterAccess(db, teamId, actorUserId);
  if (access.canManage) return serviceOk(null);
  if (access.canView) return serviceError('forbidden', 'Only coaches can manage the roster.');
  return serviceError('not_found', 'Team not found.');
}

async function readPlayer(db: SupabaseClient, teamId: string, playerId: string) {
  return db.from('players').select(PLAYER_COLUMNS).eq('id', playerId).eq('team_id', teamId).maybeSingle();
}

/**
 * A player on the team, for those who may open their page (as the web player
 * page decides: roster managers, team staff, the player and their parents).
 */
export async function loadRosterPlayer(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<RosterPlayerResponse>> {
  const parsed = rosterPlayerIdInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { teamId, playerId } = parsed.data;

  const access = await getPlayerAccess(db, teamId, playerId, actorUserId);
  if (!access.canView) return serviceError('not_found', 'Player not found.');

  const { data, error } = await readPlayer(db, teamId, playerId);
  if (error) return failed('loadRosterPlayer', teamId, playerId, actorUserId, error);
  if (!data) return serviceError('not_found', 'Player not found.');
  return serviceOk({ player: toPlayer(data as PlayerRow), canManage: access.canManage });
}

/**
 * Adds a player and their membership. With an email, also invites them to the
 * team (best effort, as on the web: the player is added either way).
 */
export async function createRosterPlayer(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<CreateRosterPlayerResponse>> {
  const parsed = createRosterPlayerInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { teamId, ...fields } = parsed.data;

  const authorized = await authorizeManager(db, actorUserId, teamId);
  if (!authorized.ok) return authorized;

  const { data: player, error } = await db
    .from('players')
    .insert({ team_id: teamId, ...toColumns(fields) })
    .select('id')
    .single();
  if (error || !player) return failed('createRosterPlayer', teamId, null, actorUserId, error);
  const playerId = player.id as string;

  const { error: membershipError } = await db.from('player_team_memberships').insert({
    player_id: playerId,
    team_id: teamId,
    jersey_number: fields.jerseyNumber,
    is_active: true,
  });
  if (membershipError) {
    // Nothing references the new player yet, so it goes rather than lingering without a membership.
    const { error: cleanupError } = await db.from('players').delete().eq('id', playerId).eq('team_id', teamId);
    if (cleanupError) console.error(`[roster] createRosterPlayer cleanup failed player=${playerId}:`, cleanupError);
    if ((membershipError as DbError).code === UNIQUE_VIOLATION) return jerseyTaken(fields.jerseyNumber);
    return failed('createRosterPlayer', teamId, playerId, actorUserId, membershipError);
  }

  const invited = await invitePlayer(db, actorUserId, teamId, playerId, fields);
  return serviceOk({ playerId, invited });
}

/**
 * Emails a new player an invite to the team when they have an address (an
 * existing account is connected at once); whether that worked. The invitation
 * records the player, so accepting it claims exactly them.
 */
async function invitePlayer(
  db: SupabaseClient,
  actorUserId: string,
  teamId: string,
  playerId: string,
  fields: RosterPlayerFields,
): Promise<boolean> {
  if (!fields.email) return false;
  const result = await invitePlayerToApp(db, actorUserId, teamId, playerId, fields.email);
  if (!result.ok) console.error(`[roster] player invite failed team=${teamId} player=${playerId}:`, result.error);
  return result.ok;
}

/** Replaces every editable field of an active player, keeping the active membership's jersey in step. */
export async function updateRosterPlayer(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<RosterPlayerWriteResponse>> {
  const parsed = updateRosterPlayerInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { teamId, playerId, ...fields } = parsed.data;

  const authorized = await authorizeManager(db, actorUserId, teamId);
  if (!authorized.ok) return authorized;

  const { data: current, error: readError } = await readPlayer(db, teamId, playerId);
  if (readError) return failed('updateRosterPlayer', teamId, playerId, actorUserId, readError);
  if (!current) return serviceError('not_found', 'Player not found.');
  if (!(current as PlayerRow).is_active) return serviceError('conflict', 'Reactivate the player before editing them.');

  const membership = await setActiveMembershipJersey(db, teamId, playerId, fields.jerseyNumber);
  if (membership.error) {
    if (membership.error.code === UNIQUE_VIOLATION) return jerseyTaken(fields.jerseyNumber);
    return failed('updateRosterPlayer', teamId, playerId, actorUserId, membership.error);
  }

  const { error } = await db
    .from('players')
    .update({ ...toColumns(fields), updated_at: new Date().toISOString() })
    .eq('id', playerId)
    .eq('team_id', teamId);
  if (error) {
    const revert = await setActiveMembershipJersey(db, teamId, playerId, (current as PlayerRow).jersey_number);
    if (revert.error) console.error(`[roster] updateRosterPlayer revert failed player=${playerId}:`, revert.error);
    return failed('updateRosterPlayer', teamId, playerId, actorUserId, error);
  }
  return serviceOk({ playerId });
}

async function setActiveMembershipJersey(
  db: SupabaseClient,
  teamId: string,
  playerId: string,
  jerseyNumber: number | null,
): Promise<{ error: DbError | null }> {
  const { error } = await db
    .from('player_team_memberships')
    .update({ jersey_number: jerseyNumber })
    .eq('player_id', playerId)
    .eq('team_id', teamId)
    .eq('is_active', true);
  return { error: error as DbError | null };
}

/**
 * Takes a player off the active roster, keeping their stats and history: the
 * player row is disabled and loses its jersey, and the membership ends. An
 * inactive player is left as is.
 */
export async function deactivateRosterPlayer(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<RosterPlayerWriteResponse>> {
  const parsed = deactivateRosterPlayerInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { teamId, playerId, reason } = parsed.data;

  const authorized = await authorizeManager(db, actorUserId, teamId);
  if (!authorized.ok) return authorized;

  const { data: current, error: readError } = await readPlayer(db, teamId, playerId);
  if (readError) return failed('deactivateRosterPlayer', teamId, playerId, actorUserId, readError);
  if (!current) return serviceError('not_found', 'Player not found.');
  if (!(current as PlayerRow).is_active) return serviceOk({ playerId });

  const now = new Date().toISOString();
  const { data: ended, error: membershipError } = await db
    .from('player_team_memberships')
    .update({ is_active: false, left_at: now, transfer_reason: reason })
    .eq('player_id', playerId)
    .eq('team_id', teamId)
    .eq('is_active', true)
    .select('id');
  if (membershipError) return failed('deactivateRosterPlayer', teamId, playerId, actorUserId, membershipError);

  const { error } = await db
    .from('players')
    .update({ is_active: false, jersey_number: null, disabled_at: now, disabled_by: actorUserId, updated_at: now })
    .eq('id', playerId)
    .eq('team_id', teamId);
  if (error) {
    const endedIds = ((ended ?? []) as Array<{ id: string }>).map((m) => m.id);
    if (endedIds.length > 0) {
      const { error: revertError } = await db
        .from('player_team_memberships')
        .update({ is_active: true, left_at: null, transfer_reason: null })
        .in('id', endedIds);
      if (revertError) console.error(`[roster] deactivateRosterPlayer revert failed player=${playerId}:`, revertError);
    }
    return failed('deactivateRosterPlayer', teamId, playerId, actorUserId, error);
  }
  return serviceOk({ playerId });
}

/**
 * Brings a disabled player back with an optional jersey number: their latest
 * membership on the team reopens (or a new one starts), then the player row.
 * An active player is left as is.
 */
export async function reactivateRosterPlayer(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<RosterPlayerWriteResponse>> {
  const parsed = reactivateRosterPlayerInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { teamId, playerId } = parsed.data;
  const jerseyNumber = parsed.data.jerseyNumber ?? null;

  const authorized = await authorizeManager(db, actorUserId, teamId);
  if (!authorized.ok) return authorized;

  const { data: current, error: readError } = await readPlayer(db, teamId, playerId);
  if (readError) return failed('reactivateRosterPlayer', teamId, playerId, actorUserId, readError);
  if (!current) return serviceError('not_found', 'Player not found.');
  const player = current as PlayerRow;
  if (player.is_active) return serviceOk({ playerId });

  const { data: latest, error: latestError } = await db
    .from('player_team_memberships')
    .select('id, jersey_number, left_at, transfer_reason')
    .eq('player_id', playerId)
    .eq('team_id', teamId)
    .order('joined_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestError) return failed('reactivateRosterPlayer', teamId, playerId, actorUserId, latestError);

  const reopened = latest as { id: string; jersey_number: number | null; left_at: string | null; transfer_reason: string | null } | null;
  const { data: membership, error: membershipError } = reopened
    ? await db
        .from('player_team_memberships')
        .update({ is_active: true, jersey_number: jerseyNumber, left_at: null, transfer_reason: null })
        .eq('id', reopened.id)
        .select('id')
        .single()
    : await db
        .from('player_team_memberships')
        .insert({ player_id: playerId, team_id: teamId, jersey_number: jerseyNumber, is_active: true })
        .select('id')
        .single();
  if (membershipError || !membership) {
    if ((membershipError as DbError | null)?.code === UNIQUE_VIOLATION) return jerseyTaken(jerseyNumber);
    return failed('reactivateRosterPlayer', teamId, playerId, actorUserId, membershipError);
  }

  const { error } = await db
    .from('players')
    .update({ is_active: true, jersey_number: jerseyNumber, disabled_at: null, disabled_by: null, updated_at: new Date().toISOString() })
    .eq('id', playerId)
    .eq('team_id', teamId);
  if (error) {
    const { error: revertError } = reopened
      ? await db
          .from('player_team_memberships')
          .update({ is_active: false, jersey_number: reopened.jersey_number, left_at: reopened.left_at, transfer_reason: reopened.transfer_reason })
          .eq('id', reopened.id)
      : await db.from('player_team_memberships').delete().eq('id', membership.id as string);
    if (revertError) console.error(`[roster] reactivateRosterPlayer revert failed player=${playerId}:`, revertError);
    return failed('reactivateRosterPlayer', teamId, playerId, actorUserId, error);
  }
  return serviceOk({ playerId });
}
