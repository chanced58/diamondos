'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { createTeamSchema } from '@baseball/shared';

export async function createTeamAction(_prevState: string | null | undefined, formData: FormData) {
  // Use the cookie-based client to verify the user's identity
  const authClient = createServerClient();
  const { data: { user }, error: authError } = await authClient.auth.getUser();

  if (authError) return `Auth error: ${authError.message}`;
  if (!user) return 'Not authenticated — please log in again.';

  const raw = {
    name: formData.get('name') as string,
    organization: (formData.get('organization') as string) || undefined,
    stateCode: (formData.get('stateCode') as string) || undefined,
  };

  const parsed = createTeamSchema.safeParse(raw);
  if (!parsed.success) {
    return parsed.error.errors[0].message;
  }

  // Use the service role client to bypass RLS for trusted server-side operations.
  // The user has already been verified above via their session cookie.
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // 1. Create the team
  const { data: team, error: teamError } = await supabase
    .from('teams')
    .insert({
      name: parsed.data.name,
      organization: parsed.data.organization ?? null,
      state_code: parsed.data.stateCode ?? null,
      created_by: user.id,
    })
    .select()
    .single();
  if (teamError) return `Team insert failed: ${teamError.message}`;

  // 2. Add creator as head coach
  const { error: memberError } = await supabase
    .from('team_members')
    .insert({ team_id: team.id, user_id: user.id, role: 'head_coach' });
  if (memberError) return `Member insert failed: ${memberError.message}`;

  // 3. Create default Announcements channel
  const { data: channel, error: channelError } = await supabase
    .from('channels')
    .insert({
      team_id: team.id,
      channel_type: 'announcement',
      name: 'Announcements',
      created_by: user.id,
    })
    .select()
    .single();
  if (channelError) return `Channel insert failed: ${channelError.message}`;

  // 4. Add creator to the channel with post permission
  const { error: cmError } = await supabase.from('channel_members').insert({
    channel_id: channel.id,
    user_id: user.id,
    can_post: true,
  });
  if (cmError) return `Channel member insert failed: ${cmError.message}`;

  redirect(`/teams/${team.id}/roster`);
}
