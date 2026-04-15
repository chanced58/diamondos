'use server';

import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';

export async function inviteLeagueAdminAction(_prevState: string | null | undefined, formData: FormData) {
  const authClient = createServerClient();
  const { data: { user }, error: authError } = await authClient.auth.getUser();

  if (authError) return `Auth error: ${authError.message}`;
  if (!user) return 'Not authenticated — please log in again.';

  const email = ((formData.get('email') as string) || '').trim().toLowerCase();
  const firstName = ((formData.get('firstName') as string) || '').trim();
  const lastName = ((formData.get('lastName') as string) || '').trim();
  const VALID_TIERS = ['free', 'starter', 'pro'] as const;
  const rawTier = ((formData.get('tier') as string) || 'free').trim().toLowerCase();
  const tier = VALID_TIERS.includes(rawTier as any) ? rawTier : 'free';

  if (!email) return 'Email is required.';
  if (!firstName) return 'First name is required.';
  if (!lastName) return 'Last name is required.';

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

  // 1. Create league with placeholder name (no setup_completed_at → wizard triggers)
  const placeholderName = `${firstName} ${lastName}'s League`;
  const { data: league, error: leagueError } = await db
    .from('leagues')
    .insert({
      name: placeholderName,
      created_by: user.id,
    })
    .select()
    .single();

  if (leagueError) return `League creation failed: ${leagueError.message}`;

  // Rollback helper
  async function rollbackLeague() {
    await db.from('subscriptions').delete().eq('league_id', league.id);
    await db.from('league_channel_members').delete().eq('league_channel_id', league.id);
    await db.from('league_channels').delete().eq('league_id', league.id);
    await db.from('league_staff').delete().eq('league_id', league.id);
    await db.from('leagues').delete().eq('id', league.id);
  }

  // 2. Resolve user (existing or invite new)
  let adminUserId: string;

  const { data: existingProfile } = await supabase
    .from('user_profiles')
    .select('id')
    .eq('email', email)
    .maybeSingle();

  if (existingProfile) {
    adminUserId = existingProfile.id;
  } else {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL?.replace('.supabase.co', '.vercel.app');
    const redirectTo = appUrl ? `${appUrl}/auth/callback` : '/auth/callback';
    const { data: inviteData, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(
      email,
      { redirectTo, data: { first_name: firstName, last_name: lastName } },
    );
    if (inviteError) {
      await rollbackLeague();
      return `Invite failed: ${inviteError.message}`;
    }
    adminUserId = inviteData.user.id;

    const { error: profileError } = await supabase.from('user_profiles').upsert({
      id: adminUserId,
      email,
      first_name: firstName,
      last_name: lastName,
    });
    if (profileError) {
      await rollbackLeague();
      return `Profile creation failed: ${profileError.message}`;
    }
  }

  // 3. Add as league admin
  const { error: staffError } = await db.from('league_staff').insert({
    league_id: league.id,
    user_id: adminUserId,
    role: 'league_admin',
  });
  if (staffError) {
    await rollbackLeague();
    return `Staff assignment failed: ${staffError.message}`;
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
    return `Channel creation failed: ${channelError.message}`;
  }

  // 5. Add admin to channel
  const { error: cmError } = await db.from('league_channel_members').insert({
    league_channel_id: channel.id,
    user_id: adminUserId,
    can_post: true,
  });
  if (cmError) {
    await rollbackLeague();
    return `Channel member failed: ${cmError.message}`;
  }

  // 6. Create league subscription
  const { error: subError } = await db.from('subscriptions').insert({
    entity_type: 'league',
    league_id: league.id,
    tier,
    status: 'active',
  });
  if (subError) {
    await rollbackLeague();
    return `Subscription creation failed: ${subError.message}`;
  }

  // Return success message (prefixed with "ok:" so the form can detect it)
  const action = existingProfile ? 'added' : 'invited';
  const tierLabel = tier.charAt(0).toUpperCase() + tier.slice(1);
  return `ok:${firstName} ${lastName} has been ${action} as league admin for "${placeholderName}" (${tierLabel} tier).`;
}
