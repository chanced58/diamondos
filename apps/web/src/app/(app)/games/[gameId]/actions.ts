'use server';

import { redirect } from 'next/navigation';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { formatDate } from '@baseball/shared';
import { postEventAlert } from '@/app/(app)/messages/notify';

const COACH_ROLES = ['head_coach', 'assistant_coach', 'athletic_director'];

async function getAuthorizedCoach(supabase: SupabaseClient, userId: string, gameId: string) {
  const { data: game } = await supabase
    .from('games')
    .select('team_id, opponent_name, scheduled_at, status')
    .eq('id', gameId)
    .single();
  if (!game) return { error: 'Game not found.' };

  const { data: membership } = await supabase
    .from('team_members')
    .select('role')
    .eq('team_id', game.team_id)
    .eq('user_id', userId)
    .single();

  if (!membership || !COACH_ROLES.includes(membership.role)) {
    return { error: 'Only coaches can perform this action.' };
  }

  return { game };
}

export async function cancelGameAction(_prevState: string | null | undefined, formData: FormData) {
  const authClient = createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return 'Not authenticated.';

  const gameId = formData.get('gameId') as string;
  if (!gameId) return 'Missing game ID.';

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Verify user is a coach on this team
  const { data: game } = await supabase
    .from('games')
    .select('team_id, opponent_name, scheduled_at')
    .eq('id', gameId)
    .single();

  if (!game) return 'Game not found.';

  const { data: membership } = await supabase
    .from('team_members')
    .select('role')
    .eq('team_id', game.team_id)
    .eq('user_id', user.id)
    .single();

  const isCoach =
    membership?.role === 'head_coach' ||
    membership?.role === 'assistant_coach' ||
    membership?.role === 'athletic_director';

  if (!isCoach) return 'Only coaches can cancel games.';

  const { error } = await supabase
    .from('games')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', gameId);

  if (error) return `Failed to cancel game: ${error.message}`;

  if (formData.get('notifyTeam') === 'on') {
    const msg = `⚠️ Game vs. ${game.opponent_name} on ${formatDate(game.scheduled_at)} has been cancelled.`;
    await postEventAlert(supabase, game.team_id, user.id, msg);
  }

  redirect('/games');
}

export async function startGameAction(_prevState: string | null | undefined, formData: FormData) {
  const authClient = createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return 'Not authenticated.';

  const gameId = formData.get('gameId') as string;
  if (!gameId) return 'Missing game ID.';

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const result = await getAuthorizedCoach(supabase, user.id, gameId);
  if ('error' in result) return result.error;
  const { game } = result;

  if (game.status !== 'scheduled') {
    return 'Game is not in a schedulable state.';
  }

  // Require at least one player in the lineup
  const { count } = await supabase
    .from('game_lineups')
    .select('id', { count: 'exact', head: true })
    .eq('game_id', gameId);

  if (!count || count === 0) {
    return 'Set the lineup before starting the game.';
  }

  // Get starting pitcher (lowest batting order that has P position, or first in order)
  const { data: lineupRows } = await supabase
    .from('game_lineups')
    .select('player_id, batting_order, starting_position')
    .eq('game_id', gameId)
    .order('batting_order');

  const startingPitcher = lineupRows?.find((r) => r.starting_position === 'P') ?? lineupRows?.[0];

  const now = new Date().toISOString();

  // Update game status
  const { error: updateError } = await supabase
    .from('games')
    .update({ status: 'in_progress', started_at: now, updated_at: now })
    .eq('id', gameId);

  if (updateError) return `Failed to start game: ${updateError.message}`;

  // Insert GAME_START event
  const { error: eventError } = await supabase.from('game_events').insert({
    id: crypto.randomUUID(),
    game_id: gameId,
    sequence_number: 1,
    event_type: 'game_start',
    inning: 1,
    is_top_of_inning: true,
    payload: { homeLineupPitcherId: startingPitcher?.player_id ?? null },
    occurred_at: now,
    created_by: user.id,
    device_id: 'web',
  });

  if (eventError) return `Failed to record game start: ${eventError.message}`;

  redirect(`/games/${gameId}/score`);
}

export async function endGameAction(_prevState: string | null | undefined, formData: FormData) {
  const authClient = createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return 'Not authenticated.';

  const gameId = formData.get('gameId') as string;
  if (!gameId) return 'Missing game ID.';

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const result = await getAuthorizedCoach(supabase, user.id, gameId);
  if ('error' in result) return result.error;

  const homeScore = parseInt(formData.get('homeScore') as string, 10) || 0;
  const awayScore = parseInt(formData.get('awayScore') as string, 10) || 0;

  // Get current max sequence number
  const { data: lastEvent } = await supabase
    .from('game_events')
    .select('sequence_number')
    .eq('game_id', gameId)
    .order('sequence_number', { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextSeq = (lastEvent?.sequence_number ?? 0) + 1;
  const now = new Date().toISOString();

  await supabase.from('game_events').insert({
    id: crypto.randomUUID(),
    game_id: gameId,
    sequence_number: nextSeq,
    event_type: 'game_end',
    inning: parseInt(formData.get('inning') as string, 10) || 1,
    is_top_of_inning: formData.get('isTopOfInning') === 'true',
    payload: { homeScore, awayScore },
    occurred_at: now,
    created_by: user.id,
    device_id: 'web',
  });

  await supabase
    .from('games')
    .update({
      status: 'completed',
      completed_at: now,
      updated_at: now,
      home_score: homeScore,
      away_score: awayScore,
    })
    .eq('id', gameId);

  redirect(`/games/${gameId}`);
}
