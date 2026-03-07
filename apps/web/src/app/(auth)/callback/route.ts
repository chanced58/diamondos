import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { addToTeamChannels } from '@/lib/team-channels';

/**
 * OAuth and magic-link callback handler.
 * Exchanges the PKCE code for a session and sets auth cookies directly on the
 * redirect response so they are forwarded to the browser in the same round-trip.
 *
 * For staff/coach invites: creates the team_members row and marks the invitation accepted.
 * For player invites: links players.user_id and creates a team_members row with role='player'.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');

  // Invite-related params embedded in the redirectTo URL
  const teamId = searchParams.get('team');
  const role   = searchParams.get('role');
  const playerId = searchParams.get('player');
  const playersParam = searchParams.get('players'); // comma-separated player IDs for parent invites

  const redirectTo = searchParams.get('redirectTo') ?? '/dashboard';

  if (code) {
    const successResponse = NextResponse.redirect(`${origin}${redirectTo}`);

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet: Array<{ name: string; value: string; options?: any }>) {
            cookiesToSet.forEach(({ name, value, options }) =>
              successResponse.cookies.set(name, value, options),
            );
          },
        },
      },
    );

    const { data: { session }, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && session) {
      // Use service-role client for post-invite DB writes (bypasses RLS)
      const serviceClient = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
      );

      // Staff / coach invite accepted (not player or parent — those have dedicated blocks below)
      if (teamId && role && role !== 'player' && role !== 'parent') {
        await serviceClient
          .from('team_members')
          .upsert(
            { team_id: teamId, user_id: session.user.id, role, is_active: true },
            { onConflict: 'team_id,user_id' },
          );

        await serviceClient
          .from('team_invitations')
          .update({ status: 'accepted', accepted_at: new Date().toISOString() })
          .eq('team_id', teamId)
          .eq('email', session.user.email!);

        await addToTeamChannels(serviceClient, teamId, session.user.id, role);
      }

      // Parent invite accepted
      if (teamId && role === 'parent') {
        await serviceClient
          .from('team_members')
          .upsert(
            { team_id: teamId, user_id: session.user.id, role: 'parent', is_active: true },
            { onConflict: 'team_id,user_id' },
          );

        // Create parent-player links for any player IDs passed in the invite URL
        if (playersParam) {
          for (const pid of playersParam.split(',').filter(Boolean)) {
            await serviceClient
              .from('parent_player_links')
              .upsert(
                { parent_user_id: session.user.id, player_id: pid },
                { onConflict: 'parent_user_id,player_id', ignoreDuplicates: true },
              );
          }
        }

        await serviceClient
          .from('team_invitations')
          .update({ status: 'accepted', accepted_at: new Date().toISOString() })
          .eq('team_id', teamId)
          .eq('email', session.user.email!);

        await addToTeamChannels(serviceClient, teamId, session.user.id, 'parent');
      }

      // Player invite accepted
      if (teamId && role === 'player' && playerId) {
        // Link the player record to this user account
        await serviceClient
          .from('players')
          .update({ user_id: session.user.id })
          .eq('id', playerId)
          .eq('team_id', teamId);

        // Create a team_members row so the player can access the team
        await serviceClient
          .from('team_members')
          .upsert(
            { team_id: teamId, user_id: session.user.id, role: 'player', is_active: true },
            { onConflict: 'team_id,user_id' },
          );
      }

      return successResponse;
    }
  }

  // Auth error — redirect to login with error indicator
  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
