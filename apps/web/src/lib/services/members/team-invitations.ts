import type { SupabaseClient } from '@supabase/supabase-js';
import {
  invitationIdInputSchema,
  inviteParentInputSchema,
  invitePlayerInputSchema,
  inviteStaffInputSchema,
  type InviteResult,
  type MemberWriteResponse,
} from '@baseball/shared';
import { addToTeamChannels } from '@/lib/team-channels';
import { invalidInput, serviceError, serviceOk, type ServiceResult } from '../result';
import { authorizeMemberManager, refuseLeadershipChange } from './authorize';

/**
 * A team's invitations (the roster's Invite staff and Invite parent forms and
 * the team admin Users page), shared by the web actions and the mobile
 * `/api/m/v1/teams/:teamId/members` routes. Member managers only
 * (`authorizeMemberManager`).
 *
 * Accepting an invitation goes by the `team_invitations` row alone (see
 * lib/auth/process-invite.ts), so every new-account invitation is saved
 * before its email goes out and put back if the email fails. An invitation
 * never changes the role of someone already active on the team, and only
 * head coaches, athletic directors and platform admins invite, resend or
 * cancel those two roles, or replace an open invitation for one
 * (`refuseLeadershipChange`, `refuseLeadershipOverwrite`).
 */

/** Stands in for the email of someone recorded without one. */
const PLACEHOLDER_DOMAIN = '@placeholder.internal';

type InvitationRow = {
  team_id: string;
  email: string;
  role: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  jersey_number?: number | null;
  player_ids?: string[] | null;
  invited_by: string;
};

function failed<T>(action: string, teamId: string, actorUserId: string, error: unknown): ServiceResult<T> {
  console.error(`[invitations] ${action} failed team=${teamId} actor=${actorUserId}:`, error);
  return serviceError('failed', 'Something went wrong. Please try again.');
}

function appUrl(): string | null {
  return process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? null;
}

/** The invite link's query: team and role, plus the player ids older invitations read from it. */
function inviteRedirect(base: string, teamId: string, role: string, playerIds: string[]): string {
  const params = new URLSearchParams({ team: teamId, role });
  if (role === 'player' && playerIds[0]) params.set('player', playerIds[0]);
  if (role === 'parent' && playerIds.length > 0) params.set('players', playerIds.join(','));
  return `${base}/auth/callback?${params.toString()}`;
}

/**
 * Saves a pending invitation, then emails it. When the email fails, the row
 * is put back as it was (a new one removed), so no invitation waits on an
 * email that never went out.
 */
async function sendInvitation(
  db: SupabaseClient,
  actorUserId: string,
  row: InvitationRow,
): Promise<ServiceResult<null>> {
  const base = appUrl();
  if (!base) return serviceError('unavailable', 'Invites are not set up on this server (APP_URL is missing).');

  const { data: previous, error: previousError } = await db
    .from('team_invitations')
    .select('id, first_name, last_name, phone, role, jersey_number, player_ids, invited_by, invited_at, status, accepted_at')
    .eq('team_id', row.team_id)
    .eq('email', row.email)
    .maybeSingle();
  if (previousError) return failed('sendInvitation', row.team_id, actorUserId, previousError);

  const { error: saveError } = await db
    .from('team_invitations')
    .upsert({ ...row, status: 'pending', invited_at: new Date().toISOString() }, { onConflict: 'team_id,email' });
  if (saveError) return failed('sendInvitation', row.team_id, actorUserId, saveError);

  const playerIds = row.player_ids ?? [];
  const { error: emailError } = await db.auth.admin.inviteUserByEmail(row.email, {
    data: { invited_to_team: row.team_id, invited_role: row.role },
    redirectTo: inviteRedirect(base, row.team_id, row.role, playerIds),
  });
  if (!emailError) return serviceOk(null);

  const { error: undoError } = previous
    ? await db
        .from('team_invitations')
        .update({
          first_name: previous.first_name,
          last_name: previous.last_name,
          phone: previous.phone,
          role: previous.role,
          jersey_number: previous.jersey_number,
          player_ids: previous.player_ids,
          invited_by: previous.invited_by,
          invited_at: previous.invited_at,
          status: previous.status,
          accepted_at: previous.accepted_at,
        })
        .eq('id', previous.id)
    : await db.from('team_invitations').delete().eq('team_id', row.team_id).eq('email', row.email);
  if (undoError) console.error(`[invitations] undo failed team=${row.team_id}:`, undoError);

  if (emailError.status === 429 || emailError.message.toLowerCase().includes('rate')) {
    return serviceError('unavailable', 'Email rate limit reached. Please wait a few minutes and try again.');
  }
  console.error(`[invitations] invite email failed team=${row.team_id} actor=${actorUserId}:`, emailError);
  return serviceError('failed', 'The invite email could not be sent. Please try again.');
}

/**
 * Saving an invitation replaces the one already open (pending or accepted) at
 * that address on the team, role included, so an actor without
 * `canManageLeadership` may not invite an address whose open invitation is
 * for the head coach or athletic director role. Null when allowed.
 */
async function refuseLeadershipOverwrite(
  db: SupabaseClient,
  actorUserId: string,
  teamId: string,
  email: string,
  canManageLeadership: boolean,
): Promise<ServiceResult<never> | null> {
  if (canManageLeadership) return null;
  const { data: open, error } = await db
    .from('team_invitations')
    .select('role')
    .eq('team_id', teamId)
    .eq('email', email)
    .in('status', ['pending', 'accepted'])
    .maybeSingle();
  if (error) return failed('refuseLeadershipOverwrite', teamId, actorUserId, error);
  return refuseLeadershipChange(false, open?.role as string | undefined);
}

/** The account with this email, if there is one (profiles first, then auth). */
async function findAccount(db: SupabaseClient, email: string): Promise<ServiceResult<{ id: string; firstName: string | null; lastName: string | null } | null>> {
  const { data: profile, error } = await db.from('user_profiles').select('id, first_name, last_name').eq('email', email).maybeSingle();
  if (error) return serviceError('failed', error.message);
  if (profile) return serviceOk({ id: profile.id as string, firstName: profile.first_name as string | null, lastName: profile.last_name as string | null });

  // user_profiles.email can be null — ask auth.users directly.
  const { data: authId, error: rpcError } = await db.rpc('find_auth_user_id_by_email', { p_email: email });
  if (rpcError) return serviceError('failed', rpcError.message);
  return serviceOk(authId ? { id: authId as string, firstName: null, lastName: null } : null);
}

/**
 * Adds an existing account to the team with `role`, unless they are already
 * active on it with another role (that is a role change, made on purpose).
 */
async function addExistingAccount(
  db: SupabaseClient,
  actorUserId: string,
  teamId: string,
  accountId: string,
  role: string,
  jerseyNumber: number | null,
): Promise<ServiceResult<null>> {
  const { data: current, error: currentError } = await db
    .from('team_members')
    .select('role, is_active')
    .eq('team_id', teamId)
    .eq('user_id', accountId)
    .maybeSingle();
  if (currentError) return failed('addExistingAccount', teamId, actorUserId, currentError);
  if (current?.is_active && current.role !== role) {
    return serviceError('conflict', 'They are already on this team with another role. Change their role instead.');
  }

  const membership: Record<string, unknown> = { team_id: teamId, user_id: accountId, role, is_active: true };
  if (jerseyNumber !== null) membership.jersey_number = jerseyNumber;
  const { error } = await db.from('team_members').upsert(membership, { onConflict: 'team_id,user_id' });
  if (error) return failed('addExistingAccount', teamId, actorUserId, error);

  await addToTeamChannels(db, teamId, accountId, role);
  return serviceOk(null);
}

/** Records an invitation as accepted for someone added directly (it shows in the roster's history). */
async function recordAccepted(db: SupabaseClient, row: InvitationRow) {
  const { error } = await db
    .from('team_invitations')
    .upsert({ ...row, status: 'accepted', accepted_at: new Date().toISOString() }, { onConflict: 'team_id,email' });
  if (error) console.error(`[invitations] accepted record failed team=${row.team_id}:`, error);
}

/** Records someone without an email (the roster lists them by name). */
async function recordPlaceholder(db: SupabaseClient, actorUserId: string, row: Omit<InvitationRow, 'email'>): Promise<ServiceResult<InviteResult>> {
  const { error } = await db.from('team_invitations').insert({
    ...row,
    email: `noemail_${Date.now()}${PLACEHOLDER_DOMAIN}`,
    status: 'pending',
  });
  if (error) return failed('recordPlaceholder', row.team_id, actorUserId, error);
  return serviceOk({ outcome: 'added' });
}

export async function inviteStaff(db: SupabaseClient, actorUserId: string, rawInput: unknown): Promise<ServiceResult<InviteResult>> {
  const parsed = inviteStaffInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { teamId, email, role, firstName, lastName, phone, jerseyNumber } = parsed.data;

  const authorized = await authorizeMemberManager(db, actorUserId, teamId);
  if (!authorized.ok) return authorized;
  const refused = refuseLeadershipChange(authorized.data.canManageLeadership, role);
  if (refused) return refused;

  const row = { team_id: teamId, role, first_name: firstName, last_name: lastName, phone, jersey_number: jerseyNumber, invited_by: actorUserId };
  if (!email) return recordPlaceholder(db, actorUserId, row);
  const overwrite = await refuseLeadershipOverwrite(db, actorUserId, teamId, email, authorized.data.canManageLeadership);
  if (overwrite) return overwrite;

  const account = await findAccount(db, email);
  if (!account.ok) return failed('inviteStaff', teamId, actorUserId, account.error);

  if (account.data) {
    const { data: target, error: targetError } = await db
      .from('user_profiles')
      .select('is_platform_admin, email')
      .eq('id', account.data.id)
      .maybeSingle();
    if (targetError) return failed('inviteStaff', teamId, actorUserId, targetError);
    if (target?.is_platform_admin) return serviceError('conflict', 'Platform administrators cannot be added to a team.');

    const added = await addExistingAccount(db, actorUserId, teamId, account.data.id, role, jerseyNumber);
    if (!added.ok) return added;

    // Backfill email and a missing name on their profile.
    const updates: Record<string, string | null> = {};
    if (!target?.email) updates.email = email;
    if (!account.data.firstName && firstName) updates.first_name = firstName;
    if (!account.data.lastName && lastName) updates.last_name = lastName;
    if (Object.keys(updates).length > 0) {
      const { error } = await db.from('user_profiles').update(updates).eq('id', account.data.id);
      if (error) console.error(`[invitations] profile backfill failed team=${teamId}:`, error);
    }

    await recordAccepted(db, { ...row, email });
    return serviceOk({ outcome: 'added' });
  }

  const sent = await sendInvitation(db, actorUserId, { ...row, email });
  return sent.ok ? serviceOk({ outcome: 'invited' }) : sent;
}

export async function inviteParent(db: SupabaseClient, actorUserId: string, rawInput: unknown): Promise<ServiceResult<InviteResult>> {
  const parsed = inviteParentInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { teamId, email, firstName, lastName, phone } = parsed.data;
  const playerIds = [...new Set(parsed.data.playerIds)];

  const authorized = await authorizeMemberManager(db, actorUserId, teamId);
  if (!authorized.ok) return authorized;

  if (playerIds.length > 0) {
    const { data: players, error } = await db
      .from('players')
      .select('id')
      .eq('team_id', teamId)
      .eq('is_active', true)
      .in('id', playerIds);
    if (error) return failed('inviteParent', teamId, actorUserId, error);
    if ((players ?? []).length !== playerIds.length) return serviceError('invalid', 'Pick players from this team’s roster.');
  }

  const row = { team_id: teamId, role: 'parent', first_name: firstName, last_name: lastName, phone, player_ids: playerIds, invited_by: actorUserId };
  if (!email) return recordPlaceholder(db, actorUserId, row);
  const overwrite = await refuseLeadershipOverwrite(db, actorUserId, teamId, email, authorized.data.canManageLeadership);
  if (overwrite) return overwrite;

  const account = await findAccount(db, email);
  if (!account.ok) return failed('inviteParent', teamId, actorUserId, account.error);

  if (account.data) {
    const added = await addExistingAccount(db, actorUserId, teamId, account.data.id, 'parent', null);
    if (!added.ok) return added;

    const { error: linkError } = await db.from('parent_player_links').upsert(
      playerIds.map((playerId) => ({ parent_user_id: account.data!.id, player_id: playerId })),
      { onConflict: 'parent_user_id,player_id', ignoreDuplicates: true },
    );
    if (linkError) return failed('inviteParent', teamId, actorUserId, linkError);

    await recordAccepted(db, { ...row, email });
    return serviceOk({ outcome: 'added' });
  }

  const sent = await sendInvitation(db, actorUserId, { ...row, email });
  return sent.ok ? serviceOk({ outcome: 'invited' }) : sent;
}

/**
 * Invites a rostered player to the app at the email given (else the one on
 * their roster entry). An existing account is connected at once; a new
 * address gets an invitation that records the player, so accepting it claims
 * exactly them (whatever their roster email).
 */
export async function invitePlayer(db: SupabaseClient, actorUserId: string, rawInput: unknown): Promise<ServiceResult<InviteResult>> {
  const parsed = invitePlayerInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { teamId, playerId } = parsed.data;

  const authorized = await authorizeMemberManager(db, actorUserId, teamId);
  if (!authorized.ok) return authorized;
  return invitePlayerToApp(db, actorUserId, teamId, playerId, parsed.data.email ?? null, authorized.data.canManageLeadership);
}

/**
 * `invitePlayer` once the caller has authorized the actor (the roster's Add
 * Player authorizes roster managers itself) and said whether they may manage
 * the leadership roles.
 */
export async function invitePlayerToApp(
  db: SupabaseClient,
  actorUserId: string,
  teamId: string,
  playerId: string,
  emailOverride: string | null,
  canManageLeadership: boolean,
): Promise<ServiceResult<InviteResult>> {
  const { data: player, error } = await db
    .from('players')
    .select('id, first_name, last_name, email, user_id')
    .eq('id', playerId)
    .eq('team_id', teamId)
    .maybeSingle();
  if (error) return failed('invitePlayer', teamId, actorUserId, error);
  if (!player) return serviceError('not_found', 'Player not found.');
  if (player.user_id) return serviceError('conflict', 'This player already has an account.');

  const email = emailOverride ?? ((player.email as string | null)?.trim().toLowerCase() || null);
  if (!email) return serviceError('invalid', 'Add an email to invite this player.');
  const overwrite = await refuseLeadershipOverwrite(db, actorUserId, teamId, email, canManageLeadership);
  if (overwrite) return overwrite;

  const account = await findAccount(db, email);
  if (!account.ok) return failed('invitePlayer', teamId, actorUserId, account.error);

  if (account.data) {
    const added = await addExistingAccount(db, actorUserId, teamId, account.data.id, 'player', null);
    if (!added.ok) return added;
    const { error: claimError } = await db
      .from('players')
      .update({ user_id: account.data.id })
      .eq('id', playerId)
      .eq('team_id', teamId)
      .is('user_id', null);
    if (claimError) return failed('invitePlayer', teamId, actorUserId, claimError);
    return serviceOk({ outcome: 'added' });
  }

  const sent = await sendInvitation(db, actorUserId, {
    team_id: teamId,
    email,
    role: 'player',
    first_name: player.first_name as string,
    last_name: player.last_name as string,
    phone: null,
    player_ids: [playerId],
    invited_by: actorUserId,
  });
  return sent.ok ? serviceOk({ outcome: 'invited' }) : sent;
}

/** Sends a pending invitation's email again, as recorded (its email, role and children). */
export async function resendInvitation(db: SupabaseClient, actorUserId: string, rawInput: unknown): Promise<ServiceResult<MemberWriteResponse>> {
  const parsed = invitationIdInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { teamId, invitationId } = parsed.data;

  const authorized = await authorizeMemberManager(db, actorUserId, teamId);
  if (!authorized.ok) return authorized;

  const { data: invitation, error } = await db
    .from('team_invitations')
    .select('team_id, email, role, first_name, last_name, phone, jersey_number, player_ids, invited_by, status')
    .eq('id', invitationId)
    .eq('team_id', teamId)
    .maybeSingle();
  if (error) return failed('resendInvitation', teamId, actorUserId, error);
  if (!invitation || invitation.status !== 'pending') return serviceError('not_found', 'Invitation not found.');
  const refused = refuseLeadershipChange(authorized.data.canManageLeadership, invitation.role as string);
  if (refused) return refused;
  if ((invitation.email as string).endsWith(PLACEHOLDER_DOMAIN)) {
    return serviceError('invalid', 'This person has no email to send an invite to.');
  }

  const recorded = invitation as InvitationRow & { status: string };
  const sent = await sendInvitation(db, actorUserId, {
    team_id: recorded.team_id,
    email: recorded.email,
    role: recorded.role,
    first_name: recorded.first_name,
    last_name: recorded.last_name,
    phone: recorded.phone,
    jersey_number: recorded.jersey_number ?? null,
    player_ids: recorded.player_ids ?? null,
    invited_by: recorded.invited_by ?? actorUserId,
  });
  return sent.ok ? serviceOk({ ok: true }) : sent;
}

export async function cancelInvitation(db: SupabaseClient, actorUserId: string, rawInput: unknown): Promise<ServiceResult<MemberWriteResponse>> {
  const parsed = invitationIdInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { teamId, invitationId } = parsed.data;

  const authorized = await authorizeMemberManager(db, actorUserId, teamId);
  if (!authorized.ok) return authorized;

  const { data: invitation, error: readError } = await db
    .from('team_invitations')
    .select('role')
    .eq('id', invitationId)
    .eq('team_id', teamId)
    .eq('status', 'pending')
    .maybeSingle();
  if (readError) return failed('cancelInvitation', teamId, actorUserId, readError);
  if (!invitation) return serviceError('not_found', 'Invitation not found.');
  const refused = refuseLeadershipChange(authorized.data.canManageLeadership, invitation.role as string);
  if (refused) return refused;

  const { data, error } = await db
    .from('team_invitations')
    .update({ status: 'cancelled' })
    .eq('id', invitationId)
    .eq('team_id', teamId)
    .eq('status', 'pending')
    .select('id');
  if (error) return failed('cancelInvitation', teamId, actorUserId, error);
  if ((data ?? []).length === 0) return serviceError('not_found', 'Invitation not found.');
  return serviceOk({ ok: true });
}
