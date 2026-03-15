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

  // Read scorekeeper config flags (default true if not provided)
  const pitchTypeEnabled    = formData.get('pitchTypeEnabled')    !== 'false';
  const pitchLocationEnabled = formData.get('pitchLocationEnabled') !== 'false';
  const sprayChartEnabled   = formData.get('sprayChartEnabled')   !== 'false';

  // Insert GAME_START event — config flags stored in payload for retrieval on the score page
  const { error: eventError } = await supabase.from('game_events').insert({
    id: crypto.randomUUID(),
    game_id: gameId,
    sequence_number: 1,
    event_type: 'game_start',
    inning: 1,
    is_top_of_inning: true,
    payload: {
      homeLineupPitcherId: startingPitcher?.player_id ?? null,
      pitchTypeEnabled,
      pitchLocationEnabled,
      sprayChartEnabled,
    },
    occurred_at: now,
    created_by: user.id,
    device_id: 'web',
  });

  if (eventError) return `Failed to record game start: ${eventError.message}`;

  redirect(`/games/${gameId}/score`);
}

export async function updateGameAction(
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

  // Allow platform admins and team coaches
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('is_platform_admin')
    .eq('id', user.id)
    .maybeSingle();

  let isCoach = profile?.is_platform_admin === true;

  if (!isCoach) {
    const { data: membership } = await supabase
      .from('team_members')
      .select('role')
      .eq('team_id', game.team_id)
      .eq('user_id', user.id)
      .single();
    isCoach = COACH_ROLES.includes(membership?.role ?? '');
  }

  if (!isCoach) return 'Only coaches can edit games.';

  const opponent = (formData.get('opponent') as string)?.trim();
  const date     = formData.get('date') as string;
  const time     = (formData.get('time') as string) || '12:00';
  if (!opponent) return 'Opponent name is required.';
  if (!date)     return 'Game date is required.';

  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute]     = time.split(':').map(Number);
  const scheduledAt        = new Date(Date.UTC(year, month - 1, day, hour, minute)).toISOString();
  const locationType = (formData.get('locationType') as string) || 'home';
  const venue        = (formData.get('venue') as string)?.trim() || null;
  const notes        = (formData.get('notes') as string)?.trim() || null;

  const latRaw  = formData.get('venue_latitude') as string;
  const lngRaw  = formData.get('venue_longitude') as string;
  const address = (formData.get('venue_address') as string) || null;
  const placeId = (formData.get('venue_place_id') as string) || null;
  const latitude  = latRaw ? parseFloat(latRaw) : null;
  const longitude = lngRaw ? parseFloat(lngRaw) : null;

  const { error } = await supabase
    .from('games')
    .update({
      opponent_name: opponent,
      scheduled_at:  scheduledAt,
      location_type: locationType,
      venue_name:    venue,
      address,
      latitude,
      longitude,
      place_id:      placeId,
      notes,
      updated_at:    new Date().toISOString(),
    })
    .eq('id', gameId);

  if (error) return `Failed to update game: ${error.message}`;
  redirect(`/games/${gameId}`);
}

export async function resetGameAction(
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

  const result = await getAuthorizedCoach(supabase, user.id, gameId);
  if ('error' in result) return result.error;
  const { game } = result;

  if (game.status === 'scheduled') return 'Game is already in scheduled state.';

  const now = new Date().toISOString();

  // Append a game_reset event instead of deleting — game_events is append-only
  const { data: lastEvent } = await supabase
    .from('game_events')
    .select('sequence_number')
    .eq('game_id', gameId)
    .order('sequence_number', { ascending: false })
    .limit(1)
    .maybeSingle();

  await supabase.from('game_events').insert({
    id: crypto.randomUUID(),
    game_id: gameId,
    sequence_number: (lastEvent?.sequence_number ?? 0) + 1,
    event_type: 'game_reset',
    inning: 1,
    is_top_of_inning: true,
    payload: { resetBy: user.id, previousStatus: game.status },
    occurred_at: now,
    created_by: user.id,
    device_id: 'web',
  });

  const { error } = await supabase
    .from('games')
    .update({
      status:           'scheduled',
      home_score:        0,
      away_score:        0,
      current_inning:    1,
      is_top_of_inning:  true,
      outs:              0,
      started_at:        null,
      completed_at:      null,
      updated_at:        now,
    })
    .eq('id', gameId);

  if (error) return `Failed to reset game: ${error.message}`;
  redirect(`/games/${gameId}`);
}

export async function saveGameNotesAction(
  _prevState: string | null | undefined,
  formData: FormData,
): Promise<string | null> {
  const authClient = createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return 'Not authenticated — please log in again.';

  const gameId = formData.get('gameId') as string;
  const teamId = formData.get('teamId') as string;
  if (!gameId || !teamId) return 'Missing required IDs.';

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Allow platform admins and team coaches
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('is_platform_admin')
    .eq('id', user.id)
    .maybeSingle();

  let isCoach = profile?.is_platform_admin === true;

  if (!isCoach) {
    const { data: membership } = await supabase
      .from('team_members')
      .select('role')
      .eq('team_id', teamId)
      .eq('user_id', user.id)
      .single();
    isCoach = COACH_ROLES.includes(membership?.role ?? '');
  }

  if (!isCoach) return 'Only coaches can save game notes.';

  const overallNotes = (formData.get('overall_notes') as string) ?? '';
  const coachNotes   = (formData.get('coach_notes') as string) ?? '';

  const { error: notesError } = await supabase
    .from('game_notes')
    .upsert(
      {
        game_id:       gameId,
        overall_notes: overallNotes || null,
        updated_by:    user.id,
        updated_at:    new Date().toISOString(),
      },
      { onConflict: 'game_id' },
    );
  if (notesError) return `Failed to save notes: ${notesError.message}`;

  // coach_notes lives in a separate coach-only table
  const { error: coachNotesError } = await supabase
    .from('game_coach_notes')
    .upsert(
      {
        game_id:     gameId,
        coach_notes: coachNotes || null,
        updated_by:  user.id,
        updated_at:  new Date().toISOString(),
      },
      { onConflict: 'game_id' },
    );
  if (coachNotesError) return `Failed to save coach notes: ${coachNotesError.message}`;

  // Collect player categorical notes (keys: player_<uuid>_<category>)
  const playerMap = new Map<string, Record<string, string>>();
  for (const [key, value] of formData.entries()) {
    const match = key.match(/^player_([0-9a-f-]{36})_(.+)$/);
    if (!match) continue;
    const [, playerId, category] = match;
    if (!playerMap.has(playerId)) playerMap.set(playerId, {});
    playerMap.get(playerId)![category] = value as string;
  }

  if (playerMap.size > 0) {
    const rows = Array.from(playerMap.entries()).map(([playerId, notes]) => ({
      game_id:          gameId,
      player_id:        playerId,
      pitching:         notes.pitching || null,
      hitting:          notes.hitting || null,
      fielding_catching: notes.fielding_catching || null,
      baserunning:      notes.baserunning || null,
      athleticism:      notes.athleticism || null,
      attitude:         notes.attitude || null,
      updated_by:       user.id,
      updated_at:       new Date().toISOString(),
    }));

    const { error: playerError } = await supabase
      .from('game_player_notes')
      .upsert(rows, { onConflict: 'game_id,player_id' });
    if (playerError) return `Failed to save player notes: ${playerError.message}`;
  }

  return 'saved';
}

export async function savePlayerGameNotesAction(
  _prevState: string | null | undefined,
  formData: FormData,
): Promise<string | null> {
  const authClient = createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return 'Not authenticated — please log in again.';

  const gameId      = formData.get('gameId') as string;
  const playerId    = formData.get('playerId') as string;
  const playerNotes = (formData.get('player_notes') as string) || null;

  if (!gameId || !playerId) return 'Missing required IDs.';

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Verify the player record belongs to this user
  const { data: player } = await supabase
    .from('players')
    .select('id, team_id')
    .eq('id', playerId)
    .eq('user_id', user.id)
    .single();
  if (!player) return 'Player record not found for your account.';

  // Verify the game belongs to the same team
  const { data: game } = await supabase
    .from('games')
    .select('id')
    .eq('id', gameId)
    .eq('team_id', player.team_id)
    .single();
  if (!game) return 'Game not found.';

  const { error } = await supabase
    .from('game_player_notes')
    .upsert(
      {
        game_id:      gameId,
        player_id:    playerId,
        player_notes: playerNotes,
        updated_by:   user.id,
        updated_at:   new Date().toISOString(),
      },
      { onConflict: 'game_id,player_id' },
    );
  if (error) return `Failed to save notes: ${error.message}`;

  return 'saved';
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
