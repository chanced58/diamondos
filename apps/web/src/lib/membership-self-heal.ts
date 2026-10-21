import type { SupabaseClient } from '@supabase/supabase-js';
import type { TeamSummary } from '@baseball/database';
import { addToTeamChannels } from '@/lib/team-channels';

/**
 * Membership self-healing shared by the web app shell (`(app)/layout.tsx`)
 * and the mobile bootstrap route (`/api/m/v1/me`), so a user who lands on
 * either surface first ends up with the same team and channel rows.
 *
 * Every function takes a service-role client: the rows being repaired are the
 * ones RLS would otherwise use to let the user see them.
 */

const TEAM_SUMMARY_COLUMNS = 'id, name, organization, logo_url, primary_color, secondary_color';

/**
 * For a user with no active team membership, recreate it from the evidence
 * that they should have one:
 *
 * 1. They created a team → head_coach membership on it.
 * 2. They have a pending or accepted invitation → membership with the invited
 *    role (also covers lost callback URL params, direct login, and
 *    memberships deactivated by a failed user deletion). Pending invites are
 *    marked accepted, the user joins the team's channels, and missing
 *    profile name/email fields are backfilled from the invite.
 *
 * Callers skip this for platform admins (they reach teams via the admin
 * panel) and Player Pro users (see the dual-role note in the layout).
 *
 * Returns the team the user now belongs to, or undefined if nothing healed.
 */
export async function healMissingTeamMembership(
  db: SupabaseClient,
  user: { id: string; email?: string | null },
): Promise<TeamSummary | undefined> {
  const { data: ownTeam } = await db
    .from('teams')
    .select(TEAM_SUMMARY_COLUMNS)
    .eq('created_by', user.id)
    .limit(1)
    .maybeSingle();

  if (ownTeam) {
    await db.from('team_members').upsert(
      { team_id: ownTeam.id, user_id: user.id, role: 'head_coach', is_active: true },
      { onConflict: 'team_id,user_id' },
    );

    await db
      .from('user_profiles')
      .update({ email: user.email })
      .eq('id', user.id)
      .is('email', null);

    return toTeamSummary(ownTeam);
  }

  if (!user.email) return undefined;

  const { data: invites } = await db
    .from('team_invitations')
    .select('id, team_id, role, email, first_name, last_name, status')
    .eq('email', user.email.toLowerCase())
    .in('status', ['pending', 'accepted'])
    .limit(5);

  if (!invites || invites.length === 0) return undefined;

  for (const invite of invites) {
    // Ensure an active team_members row exists (creates or reactivates)
    await db.from('team_members').upsert(
      { team_id: invite.team_id, user_id: user.id, role: invite.role, is_active: true },
      { onConflict: 'team_id,user_id' },
    );

    if (invite.status === 'pending') {
      await db.from('team_invitations')
        .update({ status: 'accepted', accepted_at: new Date().toISOString() })
        .eq('id', invite.id);
    }

    await addToTeamChannels(db, invite.team_id, user.id, invite.role);
  }

  // Backfill name and email on profile if missing
  const firstInvite = invites[0];
  const { data: currentProfile } = await db
    .from('user_profiles')
    .select('first_name, last_name, email')
    .eq('id', user.id)
    .maybeSingle();

  const profileUpdates: Record<string, string | null> = {};
  if (!currentProfile?.email && user.email) profileUpdates.email = user.email;
  if (!currentProfile?.first_name && firstInvite.first_name) profileUpdates.first_name = firstInvite.first_name;
  if (!currentProfile?.last_name && firstInvite.last_name) profileUpdates.last_name = firstInvite.last_name;

  if (Object.keys(profileUpdates).length > 0) {
    await db.from('user_profiles').update(profileUpdates).eq('id', user.id);
  }

  const { data: invitedTeam } = await db
    .from('teams')
    .select(TEAM_SUMMARY_COLUMNS)
    .eq('id', firstInvite.team_id)
    .maybeSingle();

  return invitedTeam ? toTeamSummary(invitedTeam) : undefined;
}

/**
 * Ensure a user who belongs to no channel at all joins their teams' channels.
 * Catches cases where the auth callback created team_members but missed
 * addToTeamChannels() (e.g., users who accepted invites before that fix).
 *
 * Non-fatal: a failure is logged and retried on the next page load / launch.
 */
export async function ensureChannelMembership(
  db: SupabaseClient,
  userId: string,
  teamIds: string[],
): Promise<void> {
  if (teamIds.length === 0) return;
  try {
    const { data: channelMembership } = await db
      .from('channel_members')
      .select('channel_id')
      .eq('user_id', userId)
      .limit(1);

    if (channelMembership && channelMembership.length > 0) return;

    for (const teamId of teamIds) {
      const { data: membership } = await db
        .from('team_members')
        .select('role')
        .eq('team_id', teamId)
        .eq('user_id', userId)
        .eq('is_active', true)
        .maybeSingle();

      if (membership) {
        await addToTeamChannels(db, teamId, userId, membership.role);
      }
    }
  } catch (err) {
    console.warn(`[membership-self-heal] channel membership repair failed user=${userId}:`, err);
  }
}

function toTeamSummary(team: TeamSummary): TeamSummary {
  return {
    id: team.id,
    name: team.name,
    organization: team.organization,
    logo_url: team.logo_url,
    primary_color: team.primary_color,
    secondary_color: team.secondary_color,
  };
}
