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
    name: (formData.get('name') ?? '') as string,
    description: (formData.get('description') ?? undefined) as string | undefined,
    stateCode: (formData.get('stateCode') ?? undefined) as string | undefined,
  };

  const adminEmail = ((formData.get('adminEmail') as string) || '').trim().toLowerCase();
  const adminFirstName = ((formData.get('adminFirstName') as string) || '').trim();
  const adminLastName = ((formData.get('adminLastName') as string) || '').trim();
  const assignDifferentAdmin = adminEmail.length > 0;

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  // 1. Create the league first (before inviting anyone)
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

  // Helper to clean up the league and all related records on failure
  async function rollbackLeague() {
    await db.from('league_channel_members').delete().eq('league_channel_id', league.id);
    await db.from('league_channels').delete().eq('league_id', league.id);
    await db.from('league_staff').delete().eq('league_id', league.id);
    await db.from('leagues').delete().eq('id', league.id);
  }

  // 2. Resolve league admin user ID (invite if needed, after league exists)
  let leagueAdminUserId = user.id;

  if (assignDifferentAdmin) {
    const { data: existingProfile } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('email', adminEmail)
      .maybeSingle();

    if (existingProfile) {
      leagueAdminUserId = existingProfile.id;
    } else {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL?.replace('.supabase.co', '.vercel.app');
      const redirectTo = appUrl ? `${appUrl}/auth/callback` : '/auth/callback';
      const { data: inviteData, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(
        adminEmail,
        { redirectTo, data: { first_name: adminFirstName, last_name: adminLastName } },
      );
      if (inviteError) {
        await rollbackLeague();
        return `Admin invite failed: ${inviteError.message}`;
      }
      leagueAdminUserId = inviteData.user.id;

      const { error: profileError } = await supabase.from('user_profiles').upsert({
        id: leagueAdminUserId,
        email: adminEmail,
        first_name: adminFirstName || null,
        last_name: adminLastName || null,
      });
      if (profileError) {
        await rollbackLeague();
        return `Profile creation failed: ${profileError.message}`;
      }
    }
  }

  // 3. Add league admin
  const { error: staffError } = await db.from('league_staff').insert({
    league_id: league.id,
    user_id: leagueAdminUserId,
    role: 'league_admin',
  });
  if (staffError) {
    await rollbackLeague();
    return `Staff insert failed: ${staffError.message}`;
  }

  // 4. Create default Announcements channel
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
  if (channelError) {
    await rollbackLeague();
    return `Channel insert failed: ${channelError.message}`;
  }

  // 5. Add league admin to the channel with post permission
  const { error: cmError } = await db.from('league_channel_members').insert({
    league_channel_id: channel.id,
    user_id: leagueAdminUserId,
    can_post: true,
  });
  if (cmError) {
    await rollbackLeague();
    return `Channel member insert failed: ${cmError.message}`;
  }

  redirect(`/admin/leagues/${league.id}`);
}
