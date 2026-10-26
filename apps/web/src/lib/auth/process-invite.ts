import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { addToTeamChannels } from '@/lib/team-channels';

export type InviteParams = {
  teamId: string | null;
  role: string | null;
  playerId: string | null;
  playersParam: string | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolves invite params from URL query first, then falls back to
 * user_metadata set when the invitation email was generated. Both are the
 * user's to edit, so they only say which invitation to look for:
 * `processInvite` takes the role and the rest from the invitation itself.
 */
export function resolveInviteParams(user: User | null, params: InviteParams): InviteParams {
  return {
    teamId:
      params.teamId ?? (user?.user_metadata?.invited_to_team as string | undefined) ?? null,
    role: params.role ?? (user?.user_metadata?.invited_role as string | undefined) ?? null,
    playerId:
      params.playerId ??
      (user?.user_metadata?.invited_player_id as string | undefined) ??
      null,
    playersParam: params.playersParam,
  };
}

/**
 * Accepts a pending team invitation for a freshly-signed-in user: upserts
 * team_members with the invitation's role, joins channels, marks the
 * invitation accepted, backfills profile name fields, and links players and
 * parents when present.
 *
 * Only a pending invitation for the user's own email on that team counts.
 * The team, role and player ids arrive in a URL, a request body or user
 * metadata, all of which the user controls, so none of them grants anything
 * alone: the role comes from the invitation, a player is claimed only when
 * their roster email is the user's, and a parent links only to the team's
 * active players.
 *
 * Non-fatal — errors are logged and swallowed so auth still completes.
 * Self-healing logic in the app layout retries any missing links.
 */
export async function processInvite(user: User, params: InviteParams): Promise<void> {
  const { teamId, playerId, playersParam } = resolveInviteParams(user, params);
  if (!teamId || !UUID_RE.test(teamId) || !user.email) return;

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return;

  try {
    const db: SupabaseClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceKey,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    await acceptInvitation(db, user, { teamId, playerId, playersParam });
  } catch (err) {
    console.error('[process-invite] failed:', err);
  }
}

/** The work of `processInvite`, with the client passed in (for tests). */
export async function acceptInvitation(
  db: SupabaseClient,
  user: User,
  { teamId, playerId, playersParam }: { teamId: string; playerId: string | null; playersParam: string | null },
): Promise<void> {
  const emailLower = (user.email ?? '').toLowerCase();
  if (!emailLower) return;

  const { data: invite, error: inviteError } = await db
    .from('team_invitations')
    .select('id, role, first_name, last_name')
    .eq('team_id', teamId)
    .eq('email', emailLower)
    .eq('status', 'pending')
    .maybeSingle();
  if (inviteError) {
    console.error(`[process-invite] invitation lookup failed team=${teamId} user=${user.id}:`, inviteError.message);
    return;
  }
  if (!invite) return;
  const role = invite.role as string;

  const { error: memberError } = await db
    .from('team_members')
    .upsert({ team_id: teamId, user_id: user.id, role, is_active: true }, { onConflict: 'team_id,user_id' });
  if (memberError) {
    console.error('[process-invite] team_members upsert failed:', memberError.message);
    return;
  }

  await addToTeamChannels(db, teamId, user.id, role);

  await db
    .from('team_invitations')
    .update({ status: 'accepted', accepted_at: new Date().toISOString() })
    .eq('id', invite.id);

  const { data: profile } = await db
    .from('user_profiles')
    .select('first_name, last_name, email')
    .eq('id', user.id)
    .maybeSingle();
  const updates: Record<string, string> = {};
  if (!profile?.email && user.email) updates.email = user.email;
  if (!profile?.first_name && invite.first_name) updates.first_name = invite.first_name as string;
  if (!profile?.last_name && invite.last_name) updates.last_name = invite.last_name as string;
  if (Object.keys(updates).length > 0) {
    await db.from('user_profiles').update(updates).eq('id', user.id);
  }

  if (role === 'player') await claimPlayer(db, user.id, teamId, emailLower, playerId);
  if (role === 'parent' && playersParam) await linkChildren(db, user.id, teamId, playersParam);
}

/**
 * Links the player row the coach added with this email (add player stores it
 * lowercased) to the new account, when it isn't claimed yet. A player id from
 * the link narrows the match but never widens it.
 */
async function claimPlayer(db: SupabaseClient, userId: string, teamId: string, emailLower: string, playerId: string | null) {
  let query = db
    .from('players')
    .update({ user_id: userId })
    .eq('team_id', teamId)
    .eq('email', emailLower)
    .is('user_id', null);
  if (playerId && UUID_RE.test(playerId)) query = query.eq('id', playerId);
  const { error } = await query;
  if (error) console.error(`[process-invite] player claim failed team=${teamId} user=${userId}:`, error.message);
}

/** Links a parent to the children named in their invite link, if they are active players on the invited team. */
async function linkChildren(db: SupabaseClient, userId: string, teamId: string, playersParam: string) {
  const requested = [...new Set(playersParam.split(',').filter((id) => UUID_RE.test(id)))];
  if (requested.length === 0) return;

  const { data: players, error } = await db
    .from('players')
    .select('id')
    .eq('team_id', teamId)
    .eq('is_active', true)
    .in('id', requested);
  if (error) {
    console.error(`[process-invite] child lookup failed team=${teamId} user=${userId}:`, error.message);
    return;
  }
  const rows = ((players ?? []) as Array<{ id: string }>).map((p) => ({ parent_user_id: userId, player_id: p.id }));
  if (rows.length === 0) return;
  const { error: linkError } = await db
    .from('parent_player_links')
    .upsert(rows, { onConflict: 'parent_user_id,player_id', ignoreDuplicates: true });
  if (linkError) console.error(`[process-invite] parent links failed team=${teamId} user=${userId}:`, linkError.message);
}
