'use server';

import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { authorizeMemberManager } from '@/lib/services/members/authorize';
import { inviteStaff } from '@/lib/services/members/team-invitations';

function serviceClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

/**
 * Look up whether an email belongs to an existing app user, for the staff
 * invite form. Returns their profile or null. Only for those who can invite
 * staff to the team: it tells whether an address has an account.
 */
export async function lookupUserByEmailAction(teamId: string, email: string): Promise<{
  id: string;
  firstName: string;
  lastName: string;
} | null> {
  const authClient = createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user || !teamId) return null;

  const supabase = serviceClient();
  if (!(await authorizeMemberManager(supabase, user.id, teamId)).ok) return null;

  // Try user_profiles first (fast)
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('id, first_name, last_name')
    .eq('email', email.toLowerCase().trim())
    .maybeSingle();

  if (profile) {
    return { id: profile.id, firstName: profile.first_name, lastName: profile.last_name };
  }

  // Fallback: user_profiles.email may be null — use RPC to check auth.users directly
  const { data: authId } = await supabase.rpc('find_auth_user_id_by_email', { p_email: email.toLowerCase().trim() });
  if (!authId) return null;

  // Fetch their profile by user ID
  const { data: profileById } = await supabase
    .from('user_profiles')
    .select('first_name, last_name')
    .eq('id', authId)
    .maybeSingle();

  return {
    id: authId,
    firstName: profileById?.first_name ?? '',
    lastName: profileById?.last_name ?? '',
  };
}

/** Returns 'added' or 'invited' on success, else the reason. */
export async function inviteStaffAction(
  _prevState: string | null | undefined,
  formData: FormData,
): Promise<string | null> {
  const authClient = createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return 'Not authenticated — please log in again.';

  const jerseyRaw = (formData.get('jerseyNumber') as string | null)?.trim();
  const result = await inviteStaff(serviceClient(), user.id, {
    teamId: formData.get('teamId'),
    email: formData.get('email') ?? '',
    role: formData.get('role'),
    firstName: formData.get('firstName') ?? '',
    lastName: formData.get('lastName') ?? '',
    phone: formData.get('phone') ?? '',
    jerseyNumber: jerseyRaw ? Number(jerseyRaw) : null,
  });
  return result.ok ? result.data.outcome : result.error;
}
