import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { addToTeamChannels } from '@/lib/team-channels';

export type InviteParams = {
  teamId: string | null;
  role: string | null;
  playerId: string | null;
  playersParam: string | null;
};

/**
 * Resolves invite params from URL query first, then falls back to
 * user_metadata set when the invitation email was generated.
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
 * Accepts a pending team invitation for a freshly-signed-in user:
 * upserts team_members, joins channels, marks the invitation accepted,
 * backfills profile name fields, and links players/parents when present.
 *
 * Non-fatal — errors are logged and swallowed so auth still completes.
 * Self-healing logic in the app layout retries any missing links.
 */
export async function processInvite(user: User, params: InviteParams): Promise<void> {
  const { teamId, role, playerId, playersParam } = resolveInviteParams(user, params);
  if (!teamId || !role) return;

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return;

  try {
    const db: SupabaseClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceKey,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    const { error: memberError } = await db
      .from('team_members')
      .upsert(
        { team_id: teamId, user_id: user.id, role, is_active: true },
        { onConflict: 'team_id,user_id' },
      );

    if (memberError) {
      console.error('[process-invite] team_members upsert failed:', memberError.message);
      return;
    }

    await addToTeamChannels(db, teamId, user.id, role);

    if (user.email) {
      const emailLower = user.email.toLowerCase();

      const { data: invite } = await db
        .from('team_invitations')
        .update({ status: 'accepted', accepted_at: new Date().toISOString() })
        .eq('team_id', teamId)
        .eq('email', emailLower)
        .eq('status', 'pending')
        .select('first_name, last_name')
        .maybeSingle();

      if (invite) {
        const { data: profile } = await db
          .from('user_profiles')
          .select('first_name, last_name, email')
          .eq('id', user.id)
          .maybeSingle();

        const updates: Record<string, string> = {};
        if (!profile?.email) updates.email = user.email;
        if (!profile?.first_name && invite.first_name) updates.first_name = invite.first_name;
        if (!profile?.last_name && invite.last_name) updates.last_name = invite.last_name;

        if (Object.keys(updates).length > 0) {
          await db.from('user_profiles').update(updates).eq('id', user.id);
        }
      }
    }

    if (role === 'player' && playerId) {
      await db
        .from('players')
        .update({ user_id: user.id })
        .eq('id', playerId)
        .eq('team_id', teamId);
    }

    if (role === 'parent' && playersParam) {
      const rows = playersParam
        .split(',')
        .filter(Boolean)
        .map((pid) => ({ parent_user_id: user.id, player_id: pid }));
      if (rows.length > 0) {
        await db.from('parent_player_links').upsert(rows, {
          onConflict: 'parent_user_id,player_id',
          ignoreDuplicates: true,
        });
      }
    }
  } catch (err) {
    console.error('[process-invite] failed:', err);
  }
}
