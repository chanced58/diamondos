import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';
import { addToTeamChannels } from '@/lib/team-channels';

/**
 * Processes a team invitation after the user has authenticated via magic link.
 * Called client-side from the callback page after code exchange succeeds.
 *
 * POST /api/auth/process-invite
 * Body: { teamId, role, playerId?, playersParam? }
 */
export async function POST(request: NextRequest) {
  const { teamId, role, playerId, playersParam } = await request.json();

  if (!teamId || !role) {
    return NextResponse.json({ error: 'teamId and role are required' }, { status: 400 });
  }

  // Resolve the authenticated user from session cookies
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll() {
          // Read-only — no cookie mutations needed
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const serviceClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Staff / coach invite
  if (role !== 'player' && role !== 'parent') {
    const { error: memberErr } = await serviceClient
      .from('team_members')
      .upsert(
        { team_id: teamId, user_id: user.id, role, is_active: true },
        { onConflict: 'team_id,user_id' },
      );
    if (memberErr) console.error('[process-invite] team_members upsert failed:', memberErr.message);

    // Backfill profile name from the invitation
    const { data: invite } = await serviceClient
      .from('team_invitations')
      .select('first_name, last_name')
      .eq('team_id', teamId)
      .eq('email', user.email!)
      .maybeSingle();

    if (invite) {
      const { data: profile } = await serviceClient
        .from('user_profiles')
        .select('first_name, last_name, email')
        .eq('id', user.id)
        .maybeSingle();

      const updates: Record<string, string | null> = {};
      if (!profile?.email) updates.email = user.email!;
      if (!profile?.first_name && invite.first_name) updates.first_name = invite.first_name;
      if (!profile?.last_name && invite.last_name) updates.last_name = invite.last_name;

      if (Object.keys(updates).length > 0) {
        await serviceClient.from('user_profiles').update(updates).eq('id', user.id);
      }
    }

    const { error: inviteErr } = await serviceClient
      .from('team_invitations')
      .update({ status: 'accepted', accepted_at: new Date().toISOString() })
      .eq('team_id', teamId)
      .eq('email', user.email!);
    if (inviteErr) console.error('[process-invite] invitation update failed:', inviteErr.message);

    await addToTeamChannels(serviceClient, teamId, user.id, role);
  }

  // Parent invite
  if (role === 'parent') {
    const { error: parentMemberErr } = await serviceClient
      .from('team_members')
      .upsert(
        { team_id: teamId, user_id: user.id, role: 'parent', is_active: true },
        { onConflict: 'team_id,user_id' },
      );
    if (parentMemberErr) console.error('[process-invite] parent team_members upsert failed:', parentMemberErr.message);

    if (playersParam) {
      for (const pid of playersParam.split(',').filter(Boolean)) {
        const { error: linkErr } = await serviceClient
          .from('parent_player_links')
          .upsert(
            { parent_user_id: user.id, player_id: pid },
            { onConflict: 'parent_user_id,player_id', ignoreDuplicates: true },
          );
        if (linkErr) console.error('[process-invite] parent_player_link upsert failed:', linkErr.message);
      }
    }

    const { error: parentInviteErr } = await serviceClient
      .from('team_invitations')
      .update({ status: 'accepted', accepted_at: new Date().toISOString() })
      .eq('team_id', teamId)
      .eq('email', user.email!);
    if (parentInviteErr) console.error('[process-invite] parent invitation update failed:', parentInviteErr.message);

    await addToTeamChannels(serviceClient, teamId, user.id, 'parent');
  }

  // Player invite
  if (role === 'player' && playerId) {
    const { error: playerLinkErr } = await serviceClient
      .from('players')
      .update({ user_id: user.id })
      .eq('id', playerId)
      .eq('team_id', teamId);
    if (playerLinkErr) console.error('[process-invite] player link failed:', playerLinkErr.message);

    const { error: playerMemberErr } = await serviceClient
      .from('team_members')
      .upsert(
        { team_id: teamId, user_id: user.id, role: 'player', is_active: true },
        { onConflict: 'team_id,user_id' },
      );
    if (playerMemberErr) console.error('[process-invite] player team_members upsert failed:', playerMemberErr.message);
  }

  return NextResponse.json({ ok: true });
}
