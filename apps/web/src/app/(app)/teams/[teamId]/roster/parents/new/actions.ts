'use server';

import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { inviteParent } from '@/lib/services/members/team-invitations';

/** Returns 'added' or 'invited' on success, else the reason. */
export async function inviteParentAction(
  _prevState: string | null | undefined,
  formData: FormData,
): Promise<string | null> {
  const authClient = createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return 'Not authenticated — please log in again.';

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const result = await inviteParent(supabase, user.id, {
    teamId: formData.get('teamId'),
    email: formData.get('email') ?? '',
    firstName: formData.get('firstName') ?? '',
    lastName: formData.get('lastName') ?? '',
    phone: formData.get('phone') ?? '',
    playerIds: formData.getAll('playerIds'),
  });
  return result.ok ? result.data.outcome : result.error;
}
