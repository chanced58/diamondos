'use server';

import { revalidatePath } from 'next/cache';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import type { ServiceResult } from '@/lib/services/result';
import { linkParent, removeMember, unlinkParent, updateMemberRole } from '@/lib/services/members/team-members';
import { cancelInvitation, invitePlayer, resendInvitation } from '@/lib/services/members/team-invitations';

/**
 * The team admin Users page's actions, thin wrappers over the member and
 * invitation services in lib/services/members (shared with the mobile
 * `/api/m/v1/teams/:teamId/members` routes). Each returns null on success,
 * else the reason, and refreshes the page.
 */

type Service = (db: SupabaseClient, actorUserId: string, input: unknown) => Promise<ServiceResult<unknown>>;

async function run(teamId: string, service: Service, input: Record<string, unknown>): Promise<string | null> {
  const authClient = createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return 'Not authenticated — please log in again.';

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const result = await service(db, user.id, { ...input, teamId });
  if (!result.ok) return result.error;
  revalidatePath(`/teams/${teamId}/admin/users`);
  return null;
}

export async function updateMemberRoleAction(_prevState: string | null | undefined, formData: FormData): Promise<string | null> {
  const teamId = formData.get('teamId') as string;
  return run(teamId, updateMemberRole, { memberId: formData.get('memberId'), role: formData.get('role') });
}

export async function removeMemberAction(_prevState: string | null | undefined, formData: FormData): Promise<string | null> {
  const teamId = formData.get('teamId') as string;
  return run(teamId, removeMember, { memberId: formData.get('memberId') });
}

export async function cancelInvitationAction(_prevState: string | null | undefined, formData: FormData): Promise<string | null> {
  const teamId = formData.get('teamId') as string;
  return run(teamId, cancelInvitation, { invitationId: formData.get('invitationId') });
}

/** Sends the invitation again as recorded (its email and role, not the form's). */
export async function resendInvitationAction(_prevState: string | null | undefined, formData: FormData): Promise<string | null> {
  const teamId = formData.get('teamId') as string;
  return run(teamId, resendInvitation, { invitationId: formData.get('invitationId') });
}

export async function linkParentToPlayerAction(_prevState: string | null | undefined, formData: FormData): Promise<string | null> {
  const teamId = formData.get('teamId') as string;
  return run(teamId, linkParent, { parentUserId: formData.get('parentUserId'), playerId: formData.get('playerId') });
}

export async function unlinkParentFromPlayerAction(_prevState: string | null | undefined, formData: FormData): Promise<string | null> {
  const teamId = formData.get('teamId') as string;
  return run(teamId, unlinkParent, { parentUserId: formData.get('parentUserId'), playerId: formData.get('playerId') });
}

/**
 * Invites a player at the email on their roster entry. Returns the outcome on
 * success: 'invited' (an email went out) or 'added' (an existing account was
 * connected).
 */
export async function resendPlayerInviteAction(_prevState: string | null | undefined, formData: FormData): Promise<string | null> {
  const teamId = formData.get('teamId') as string;
  let outcome = 'invited';
  const error = await run(
    teamId,
    async (db, actorUserId, input) => {
      const result = await invitePlayer(db, actorUserId, input);
      if (result.ok) outcome = result.data.outcome;
      return result;
    },
    { playerId: formData.get('playerId') },
  );
  return error ?? outcome;
}

/** Connects a player to an account at the given email: an existing one at once, else by invite. */
export async function connectPlayerToAccountAction(_prevState: string | null | undefined, formData: FormData): Promise<string | null> {
  const teamId = formData.get('teamId') as string;
  const email = (formData.get('email') as string | null)?.trim();
  if (!email) return 'Email is required.';
  return run(teamId, invitePlayer, { playerId: formData.get('playerId'), email });
}
