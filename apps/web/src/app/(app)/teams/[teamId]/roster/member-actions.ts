'use server';

import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function getCallerRole(teamId: string): Promise<string | null> {
  const auth = createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return null;
  const db = serviceClient();
  const { data } = await db
    .from('team_members')
    .select('role')
    .eq('team_id', teamId)
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle();
  return data?.role ?? null;
}

const CAN_MANAGE = ['head_coach', 'assistant_coach', 'athletic_director'];

// ── Remove a confirmed team member (team_members row) ───────────────────────

export async function removeMemberAction(
  teamId: string,
  memberId: string,
): Promise<string | null> {
  const role = await getCallerRole(teamId);
  if (!role || !CAN_MANAGE.includes(role)) return 'Not authorized.';

  const db = serviceClient();
  const { error } = await db.from('team_members').delete().eq('id', memberId);
  return error ? error.message : null;
}

// ── Remove a pending invitation (team_invitations row) ──────────────────────

export async function removeInvitationAction(
  teamId: string,
  invitationId: string,
): Promise<string | null> {
  const role = await getCallerRole(teamId);
  if (!role || !CAN_MANAGE.includes(role)) return 'Not authorized.';

  const db = serviceClient();
  const { error } = await db.from('team_invitations').delete().eq('id', invitationId);
  return error ? error.message : null;
}

// ── Edit a confirmed staff member ────────────────────────────────────────────

export async function updateStaffMemberAction(
  teamId: string,
  memberId: string,  // team_members.id
  userId: string,    // user_profiles.id
  data: { firstName: string; lastName: string; email: string; phone: string; role: string; jerseyNumber: number | null },
): Promise<string | null> {
  const callerRole = await getCallerRole(teamId);
  if (!callerRole || !CAN_MANAGE.includes(callerRole)) return 'Not authorized.';

  const db = serviceClient();

  // Update role and jersey_number in team_members
  const { error: roleErr } = await db
    .from('team_members')
    .update({ role: data.role, jersey_number: data.jerseyNumber })
    .eq('id', memberId);
  if (roleErr) return roleErr.message;

  // Update profile fields
  const profileUpdate: Record<string, string | null> = {
    first_name: data.firstName || null,
    last_name: data.lastName || null,
    phone: data.phone || null,
  };
  if (data.email) profileUpdate.email = data.email.toLowerCase().trim();

  const { error: profileErr } = await db
    .from('user_profiles')
    .update(profileUpdate)
    .eq('id', userId);
  return profileErr ? profileErr.message : null;
}

// ── Edit a confirmed parent ──────────────────────────────────────────────────

export async function updateParentMemberAction(
  teamId: string,
  memberId: string,
  userId: string,
  data: { firstName: string; lastName: string; email: string; phone: string },
): Promise<string | null> {
  const callerRole = await getCallerRole(teamId);
  if (!callerRole || !CAN_MANAGE.includes(callerRole)) return 'Not authorized.';

  const db = serviceClient();
  const profileUpdate: Record<string, string | null> = {
    first_name: data.firstName || null,
    last_name: data.lastName || null,
    phone: data.phone || null,
  };
  if (data.email) profileUpdate.email = data.email.toLowerCase().trim();

  const { error } = await db.from('user_profiles').update(profileUpdate).eq('id', userId);
  return error ? error.message : null;
}

// ── Edit a pending invitation ────────────────────────────────────────────────

export async function updateInvitationAction(
  teamId: string,
  invitationId: string,
  data: { firstName: string; lastName: string; phone: string; role?: string; jerseyNumber?: number | null },
): Promise<string | null> {
  const callerRole = await getCallerRole(teamId);
  if (!callerRole || !CAN_MANAGE.includes(callerRole)) return 'Not authorized.';

  const db = serviceClient();
  const update: Record<string, string | number | null> = {
    first_name: data.firstName || null,
    last_name: data.lastName || null,
    phone: data.phone || null,
  };
  if (data.role) update.role = data.role;
  if (data.jerseyNumber !== undefined) update.jersey_number = data.jerseyNumber;

  const { error } = await db.from('team_invitations').update(update).eq('id', invitationId);
  return error ? error.message : null;
}
