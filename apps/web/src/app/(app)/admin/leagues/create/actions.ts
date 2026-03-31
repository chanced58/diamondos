'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { createLeagueSchema } from '@baseball/shared';

export async function createLeagueAction(_prevState: string | null | undefined, formData: FormData) {
  const authClient = createServerClient();
  const { data: { user }, error: authError } = await authClient.auth.getUser();

  if (authError) return `Auth error: ${authError.message}`;
  if (!user) return 'Not authenticated — please log in again.';

  const raw = {
    name: formData.get('name') as string,
    description: (formData.get('description') as string) || undefined,
    stateCode: (formData.get('stateCode') as string) || undefined,
  };

  const parsed = createLeagueSchema.safeParse(raw);
  if (!parsed.success) {
    return parsed.error.errors[0].message;
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Gate: platform admin only
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('is_platform_admin')
    .eq('id', user.id)
    .single();

  if (!profile?.is_platform_admin) return 'Platform admin access required.';

  // 1. Create the league
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const { data: league, error: leagueError } = await db
    .from('leagues')
    .insert({
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      state_code: parsed.data.stateCode ?? null,
      created_by: user.id,
    })
    .select()
    .single();
  if (leagueError) return `League insert failed: ${leagueError.message}`;

  // 2. Add creator as league_admin
  const { error: staffError } = await db.from('league_staff').insert({
    league_id: league.id,
    user_id: user.id,
    role: 'league_admin',
  });
  if (staffError) return `Staff insert failed: ${staffError.message}`;

  // 3. Create default Announcements channel
  const { data: channel, error: channelError } = await db
    .from('league_channels')
    .insert({
      league_id: league.id,
      channel_type: 'announcement',
      name: 'League Announcements',
      description: 'Official league-wide announcements',
      created_by: user.id,
    })
    .select()
    .single();
  if (channelError) return `Channel insert failed: ${channelError.message}`;

  // 4. Add creator to the channel with post permission
  const { error: cmError } = await db.from('league_channel_members').insert({
    league_channel_id: channel.id,
    user_id: user.id,
    can_post: true,
  });
  if (cmError) return `Channel member insert failed: ${cmError.message}`;

  redirect(`/admin/leagues/${league.id}`);
}
