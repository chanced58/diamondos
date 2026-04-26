import { createClient } from '@supabase/supabase-js';

/**
 * Whether `userId` is permitted to watch live game `gameId`. Mirrors the
 * RLS policy `authorized_viewers_view_live_game_events`:
 *   • platform admin
 *   • home team_member
 *   • parent of a home-team player
 *   • opponent team_member (only when opponent_teams.linked_team_id is set)
 *   • parent of an opponent-team player (linked-team players)
 *
 * Uses the service-role client so the check works regardless of which
 * tables RLS gates against the caller.
 */
export async function canViewLiveGame(gameId: string, userId: string): Promise<boolean> {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return false;

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey);

  // Platform admins can view anything.
  const { data: profile } = await db
    .from('user_profiles')
    .select('is_platform_admin')
    .eq('id', userId)
    .maybeSingle();
  if (profile?.is_platform_admin === true) return true;

  // Look up the game's team plus the (optional) linked opponent team.
  const { data: game } = await db
    .from('games')
    .select('team_id, opponent_team_id')
    .eq('id', gameId)
    .maybeSingle();
  if (!game) return false;

  let opponentLinkedTeamId: string | null = null;
  if (game.opponent_team_id) {
    const { data: opp } = await db
      .from('opponent_teams')
      .select('linked_team_id')
      .eq('id', game.opponent_team_id)
      .maybeSingle();
    opponentLinkedTeamId = opp?.linked_team_id ?? null;
  }

  const teamIds = [game.team_id, ...(opponentLinkedTeamId ? [opponentLinkedTeamId] : [])];

  // Active team_member of either team?
  const { data: membership } = await db
    .from('team_members')
    .select('team_id')
    .eq('user_id', userId)
    .eq('is_active', true)
    .in('team_id', teamIds)
    .limit(1)
    .maybeSingle();
  if (membership) return true;

  // Parent of a player on either team?
  const { data: linkedPlayer } = await db
    .from('parent_player_links')
    .select('player_id, players!inner(team_id)')
    .eq('parent_user_id', userId)
    .in('players.team_id', teamIds)
    .limit(1)
    .maybeSingle();
  if (linkedPlayer) return true;

  return false;
}
