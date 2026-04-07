import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  const authClient = createServerClient();
  const { data: { user }, error: authError } = await authClient.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Verify platform admin
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('is_platform_admin')
    .eq('id', user.id)
    .single();

  if (!profile?.is_platform_admin) {
    return NextResponse.json({ error: 'Platform admin access required' }, { status: 403 });
  }

  const body = await req.json();
  const { leagueId, email, firstName, lastName, role } = body as {
    leagueId: string;
    email: string;
    firstName?: string;
    lastName?: string;
    role: 'league_admin' | 'league_manager';
  };

  if (!leagueId || !email || !role) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  // Check if user already exists
  const { data: existingUsers } = await supabase.auth.admin.listUsers();
  const existingUser = existingUsers?.users?.find(
    (u) => u.email?.toLowerCase() === email.toLowerCase(),
  );

  let staffUserId: string;

  if (existingUser) {
    staffUserId = existingUser.id;

    // Check if already a staff member of this league
    const { data: existingStaff } = await (supabase as any)
      .from('league_staff')
      .select('id')
      .eq('league_id', leagueId)
      .eq('user_id', staffUserId)
      .maybeSingle();

    if (existingStaff) {
      return NextResponse.json({ error: 'User is already a staff member of this league' }, { status: 409 });
    }
  } else {
    // Invite new user
    const redirectTo = `${process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL?.replace('.supabase.co', '.vercel.app')}/auth/callback`;
    const { data: inviteData, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(
      email,
      { redirectTo, data: { first_name: firstName, last_name: lastName } },
    );
    if (inviteError) {
      return NextResponse.json({ error: inviteError.message }, { status: 500 });
    }
    staffUserId = inviteData.user.id;

    // Create user profile
    await supabase.from('user_profiles').upsert({
      id: staffUserId,
      email,
      first_name: firstName || null,
      last_name: lastName || null,
    });
  }

  // Add to league_staff
  const { error: staffError } = await (supabase as any).from('league_staff').insert({
    league_id: leagueId,
    user_id: staffUserId,
    role,
  });

  if (staffError) {
    return NextResponse.json({ error: staffError.message }, { status: 500 });
  }

  // Add to league announcement channel
  const { data: channels } = await (supabase as any)
    .from('league_channels')
    .select('id')
    .eq('league_id', leagueId)
    .eq('channel_type', 'announcement')
    .limit(1);

  if (channels?.[0]) {
    await (supabase as any).from('league_channel_members').insert({
      league_channel_id: channels[0].id,
      user_id: staffUserId,
      can_post: role === 'league_admin',
    });
  }

  const action = existingUser ? 'added' : 'invited';
  return NextResponse.json({
    message: `Staff member ${action} successfully`,
    userId: staffUserId,
  });
}
