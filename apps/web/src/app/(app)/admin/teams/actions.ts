'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';

/**
 * Remove a team from the platform.
 *
 * - If the team has players or game events (stats), it is converted to an
 *   opponent_team so historical data is preserved.
 * - If the team has neither, it is cleanly deleted (cascades handle related rows).
 *
 * Only platform admins may invoke this action.
 */
export async function removeTeamAction(_prevState: string | null | undefined, formData: FormData) {
  const authClient = createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return 'Not authenticated.';

  const teamId = formData.get('teamId') as string;
  if (!teamId) return 'Missing team ID.';

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

  if (!profile?.is_platform_admin) return 'Only platform admins can remove teams.';

  // Fetch the team
  const { data: team } = await supabase
    .from('teams')
    .select('id, name, organization, state_code, logo_url')
    .eq('id', teamId)
    .single();

  if (!team) return 'Team not found.';

  // Check if team has players or game events (stats)
  const [playersResult, gamesResult] = await Promise.all([
    supabase
      .from('players')
      .select('id', { count: 'exact', head: true })
      .eq('team_id', teamId),
    supabase
      .from('games')
      .select('id', { count: 'exact', head: true })
      .eq('team_id', teamId),
  ]);

  const hasPlayers = (playersResult.count ?? 0) > 0;
  const hasGames = (gamesResult.count ?? 0) > 0;

  if (hasPlayers || hasGames) {
    // Convert to opponent team to preserve stats
    const { error: insertError } = await supabase
      .from('opponent_teams')
      .insert({
        name: team.name,
        city: team.organization ?? null,
        state_code: team.state_code ?? null,
        logo_url: team.logo_url ?? null,
        linked_team_id: null,
        team_id: null,
        league_id: null,
        stats_visible: false,
        notes: `Converted from platform team on ${new Date().toISOString().split('T')[0]}`,
        created_by: user.id,
      });

    if (insertError) return `Failed to create opponent team: ${insertError.message}`;

    // Detach players from the team (they remain in the DB for historical stats)
    await supabase
      .from('players')
      .update({ team_id: null, is_active: false })
      .eq('team_id', teamId);

    // Now delete the team — cascades handle team_members, seasons, channels, etc.
    const { error: deleteError } = await supabase
      .from('teams')
      .delete()
      .eq('id', teamId);

    if (deleteError) return `Failed to remove team: ${deleteError.message}`;
  } else {
    // Clean delete — no players or stats to preserve
    const { error: deleteError } = await supabase
      .from('teams')
      .delete()
      .eq('id', teamId);

    if (deleteError) return `Failed to delete team: ${deleteError.message}`;
  }

  redirect('/admin/teams');
}
