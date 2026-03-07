'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';

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

  // Parse lineup entries: player_{id}_order and player_{id}_position
  const entries: { player_id: string; batting_order: number; starting_position: string | null }[] = [];
  for (const [key, value] of formData.entries()) {
    const orderMatch = key.match(/^player_(.+)_order$/);
    if (orderMatch) {
      const playerId = orderMatch[1];
      const order = parseInt(value as string, 10);
      if (isNaN(order) || order < 1 || order > 9) continue; // skip bench players
      const position = formData.get(`player_${playerId}_position`) as string | null;
      entries.push({
        player_id: playerId,
        batting_order: order,
        starting_position: position || null,
      });
    }
  }

  // Validate: no duplicate batting order positions
  const orders = entries.map((e) => e.batting_order);
  const uniqueOrders = new Set(orders);
  if (orders.length !== uniqueOrders.size) {
    return 'Duplicate batting order positions. Each spot (1–9) can only be assigned once.';
  }

  // Delete existing lineup and insert fresh
  await supabase.from('game_lineups').delete().eq('game_id', gameId);

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
