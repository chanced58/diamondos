'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { getMaxBattingOrder, POSITION_TO_DB } from '@baseball/shared';
import { getLeagueSettingsForTeam } from '@/lib/league-settings';

const COACH_ROLES = ['head_coach', 'assistant_coach', 'athletic_director'];

export async function saveLineupAction(
  _prevState: string | null | undefined,
  formData: FormData,
): Promise<string | null> {
  const authClient = createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return 'Not authenticated.';

  const gameId = formData.get('gameId') as string;
  if (!gameId) return 'Missing game ID.';

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: game } = await supabase
    .from('games')
    .select('team_id')
    .eq('id', gameId)
    .single();

  if (!game) return 'Game not found.';

  const { data: membership } = await supabase
    .from('team_members')
    .select('role')
    .eq('team_id', game.team_id)
    .eq('user_id', user.id)
    .single();

  if (!membership || !COACH_ROLES.includes(membership.role)) {
    return 'Only coaches can set the lineup.';
  }

  const leagueSettings = await getLeagueSettingsForTeam(supabase, game.team_id);
  const maxBatters = getMaxBattingOrder(leagueSettings);

  // Parse lineup entries: player_{id}_order and player_{id}_position
  const entries: { player_id: string; batting_order: number | null; starting_position: string | null }[] = [];
  for (const [key, value] of formData.entries()) {
    const orderMatch = key.match(/^player_(.+)_order$/);
    if (orderMatch) {
      const playerId = orderMatch[1];
      const order = parseInt(value as string, 10);
      const rawPosition = formData.get(`player_${playerId}_position`) as string | null;
      const dbPosition = rawPosition ? POSITION_TO_DB[rawPosition] ?? rawPosition : null;
      if (isNaN(order) || order < 1 || order > maxBatters) {
        // Bench — still include pitchers so they can be tracked for pitch counts
        // even when a DH bats in their lineup slot.
        if (dbPosition === 'pitcher') {
          entries.push({ player_id: playerId, batting_order: null, starting_position: dbPosition });
        }
        continue;
      }
      entries.push({ player_id: playerId, batting_order: order, starting_position: dbPosition });
    }
  }

  // Validate: no duplicate batting order positions (nulls are not compared)
  const orders = entries.map((e) => e.batting_order).filter((o): o is number => o !== null);
  const uniqueOrders = new Set(orders);
  if (orders.length !== uniqueOrders.size) {
    return 'Duplicate batting order positions. Each spot can only be assigned once.';
  }

  // Delete existing non-guest lineup and insert fresh. Guest entries are managed
  // separately (addExistingGuestToLineupAction / addNewGuestToLineupAction /
  // removeGuestFromLineupAction) so wiping them here would silently drop them
  // whenever a coach re-saves the roster.
  await supabase
    .from('game_lineups')
    .delete()
    .eq('game_id', gameId)
    .eq('is_guest', false);

  if (entries.length > 0) {
    const { error } = await supabase.from('game_lineups').insert(
      entries.map((e) => ({
        game_id: gameId,
        player_id: e.player_id,
        batting_order: e.batting_order,
        starting_position: e.starting_position,
        is_starter: true,
      })),
    );
    if (error) return `Failed to save lineup: ${error.message}`;
  }

  redirect(`/games/${gameId}`);
}
