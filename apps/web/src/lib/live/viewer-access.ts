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
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl) {
    console.error('[viewer-access] NEXT_PUBLIC_SUPABASE_URL is not set; denying live-game access.');
    return false;
  }
  if (!serviceRoleKey) {
    console.error(
      `[viewer-access] SUPABASE_SERVICE_ROLE_KEY is not set; denying live-game access for userId=${userId}, gameId=${gameId}.`,
    );
    return false;
  }

  const db = createClient(supabaseUrl, serviceRoleKey);

  // Platform admins can view anything.
  const { data: profile, error: profileError } = await db
    .from('user_profiles')
    .select('is_platform_admin')
    .eq('id', userId)
    .maybeSingle();
  if (profileError) {
    console.error(`[viewer-access] Failed to load user_profiles for userId=${userId}:`, profileError);
    return false;
  }
  if (profile?.is_platform_admin === true) return true;

  // Look up the game's team plus the (optional) linked opponent team.
  const { data: game, error: gameError } = await db
    .from('games')
    .select('team_id, opponent_team_id')
    .eq('id', gameId)
    .maybeSingle();
  if (gameError) {
    console.error(`[viewer-access] Failed to load game gameId=${gameId}:`, gameError);
    return false;
  }
  if (!game) return false;

  let opponentLinkedTeamId: string | null = null;
  if (game.opponent_team_id) {
    const { data: opp, error: oppError } = await db
      .from('opponent_teams')
      .select('linked_team_id')
      .eq('id', game.opponent_team_id)
      .maybeSingle();
    if (oppError) {
      console.error(
        `[viewer-access] Failed to load opponent_teams id=${game.opponent_team_id}:`,
        oppError,
      );
      return false;
    }
    opponentLinkedTeamId = opp?.linked_team_id ?? null;
  }

  const teamIds = [game.team_id, ...(opponentLinkedTeamId ? [opponentLinkedTeamId] : [])];

  // Active team_member of either team? `.in()` can match multiple rows
  // (a user who belongs to both teams), so don't use `.maybeSingle()`.
  const { data: memberships, error: memberError } = await db
    .from('team_members')
    .select('team_id')
    .eq('user_id', userId)
    .eq('is_active', true)
    .in('team_id', teamIds)
    .limit(1);
  if (memberError) {
    console.error(
      `[viewer-access] Failed to load team_members for userId=${userId}, teamIds=${teamIds.join(',')}:`,
      memberError,
    );
    return false;
  }
  if (memberships && memberships.length > 0) return true;

  // Parent of a player on either team?
  const { data: linkedPlayers, error: parentError } = await db
    .from('parent_player_links')
    .select('player_id, players!inner(team_id)')
    .eq('parent_user_id', userId)
    .in('players.team_id', teamIds)
    .limit(1);
  if (parentError) {
    console.error(
      `[viewer-access] Failed to load parent_player_links for userId=${userId}, teamIds=${teamIds.join(',')}:`,
      parentError,
    );
    return false;
  }
  if (linkedPlayers && linkedPlayers.length > 0) return true;

  return false;
}
