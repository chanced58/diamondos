'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';

const COACH_ROLES = ['head_coach', 'assistant_coach', 'athletic_director'];

const POSITION_TO_DB: Record<string, string> = {
  P: 'pitcher',
  C: 'catcher',
  '1B': 'first_base',
  '2B': 'second_base',
  '3B': 'third_base',
  SS: 'shortstop',
  LF: 'left_field',
  CF: 'center_field',
  RF: 'right_field',
  DH: 'designated_hitter',
  IF: 'infield',
  OF: 'outfield',
};

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase environment variables');
  return createClient(url, key);
}

async function getCoachContext(gameId: string) {
  const auth = createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return null;

  const db = serviceClient();
  const { data: game } = await db
    .from('games')
    .select('id, team_id, opponent_name, opponent_team_id')
    .eq('id', gameId)
    .single();
  if (!game) return null;

  const { data: membership } = await db
    .from('team_members')
    .select('role')
    .eq('team_id', game.team_id)
    .eq('user_id', user.id)
    .single();
  if (!membership || !COACH_ROLES.includes(membership.role)) return null;

  return { user, game, db };
}

/**
 * Create a new opponent team record and link it to the game, or rename an existing one.
 * Returns { opponentTeamId } on success, or { error } on failure.
 */
export async function saveOpponentTeamAction(
  _prevState: string | null | undefined,
  formData: FormData,
): Promise<string | null> {
  const gameId = formData.get('gameId') as string;
  const teamName = (formData.get('teamName') as string | null)?.trim();
  const existingOpponentTeamId = formData.get('opponentTeamId') as string | null;

  if (!teamName) return 'Team name is required.';

  const ctx = await getCoachContext(gameId);
  if (!ctx) return 'Not authorized.';

  const { user, game, db } = ctx;

  if (existingOpponentTeamId) {
    // Update the existing opponent team name
    const { error } = await db
      .from('opponent_teams')
      .update({ name: teamName, updated_at: new Date().toISOString() })
      .eq('id', existingOpponentTeamId);
    if (error) return `Failed to update opponent team: ${error.message}`;
  } else {
    // Create a new opponent_teams record
    const { data: newTeam, error: insertError } = await db
      .from('opponent_teams')
      .insert({ team_id: game.team_id, name: teamName, created_by: user.id })
      .select('id')
      .single();
    if (insertError || !newTeam) return `Failed to create opponent team: ${insertError?.message}`;

    // Link it to the game
    const { error: linkError } = await db
      .from('games')
      .update({ opponent_team_id: newTeam.id })
      .eq('id', gameId);
    if (linkError) return `Failed to link opponent team to game: ${linkError.message}`;
  }

  revalidatePath(`/games/${gameId}/opponent-lineup`);
  return null;
}

/**
 * Add a single opponent player to the opponent team roster.
 */
export async function addOpponentPlayerAction(
  _prevState: string | null | undefined,
  formData: FormData,
): Promise<string | null> {
  const gameId = formData.get('gameId') as string;
  const opponentTeamId = formData.get('opponentTeamId') as string;
  const firstName = (formData.get('firstName') as string | null)?.trim();
  const lastName = (formData.get('lastName') as string | null)?.trim();
  const jerseyNumber = (formData.get('jerseyNumber') as string | null)?.trim() || null;
  const rawPosition = formData.get('primaryPosition') as string | null;
  // Only accept known enum values; unknown values become null to avoid DB constraint violations.
  const primaryPosition = rawPosition ? (POSITION_TO_DB[rawPosition] ?? null) : null;

  if (!firstName || !lastName) return 'First and last name are required.';

  const ctx = await getCoachContext(gameId);
  if (!ctx) return 'Not authorized.';

  const { error } = await ctx.db.from('opponent_players').insert({
    opponent_team_id: opponentTeamId,
    first_name: firstName,
    last_name: lastName,
    jersey_number: jerseyNumber,
    primary_position: primaryPosition,
  });

  if (error) return `Failed to add player: ${error.message}`;

  revalidatePath(`/games/${gameId}/opponent-lineup`);
  return null;
}

/**
 * Update an existing opponent player's details.
 */
export async function updateOpponentPlayerAction(
  _prevState: string | null | undefined,
  formData: FormData,
): Promise<string | null> {
  const gameId = formData.get('gameId') as string;
  const playerId = formData.get('playerId') as string;
  const firstName = (formData.get('firstName') as string | null)?.trim();
  const lastName = (formData.get('lastName') as string | null)?.trim();
  const jerseyNumber = (formData.get('jerseyNumber') as string | null)?.trim() || null;
  const rawPosition = formData.get('primaryPosition') as string | null;
  const primaryPosition = rawPosition ? (POSITION_TO_DB[rawPosition] ?? null) : null;

  if (!firstName || !lastName) return 'First and last name are required.';

  const ctx = await getCoachContext(gameId);
  if (!ctx) return 'Not authorized.';

  const { error } = await ctx.db
    .from('opponent_players')
    .update({
      first_name: firstName,
      last_name: lastName,
      jersey_number: jerseyNumber,
      primary_position: primaryPosition,
      updated_at: new Date().toISOString(),
    })
    .eq('id', playerId);

  if (error) return `Failed to update player: ${error.message}`;

  revalidatePath(`/games/${gameId}/opponent-lineup`);
  return null;
}

/**
 * Remove an opponent player from the roster.
 */
export async function removeOpponentPlayerAction(
  _prevState: string | null | undefined,
  formData: FormData,
): Promise<string | null> {
  const gameId = formData.get('gameId') as string;
  const playerId = formData.get('playerId') as string;

  const ctx = await getCoachContext(gameId);
  if (!ctx) return 'Not authorized.';

  // Soft-delete: mark inactive rather than hard delete, preserving any stats
  const { error } = await ctx.db
    .from('opponent_players')
    .update({ is_active: false })
    .eq('id', playerId);

  if (error) return `Failed to remove player: ${error.message}`;

  revalidatePath(`/games/${gameId}/opponent-lineup`);
  return null;
}

/**
 * Save the batting order and starting positions for opponent players in this game.
 */
export async function saveOpponentLineupAction(
  _prevState: string | null | undefined,
  formData: FormData,
): Promise<string | null> {
  const gameId = formData.get('gameId') as string;
  if (!gameId) return 'Missing game ID.';

  const ctx = await getCoachContext(gameId);
  if (!ctx) return 'Not authorized.';

  const { db } = ctx;

  // Parse entries: player_{id}_order and player_{id}_position
  const entries: { opponent_player_id: string; batting_order: number | null; starting_position: string | null }[] = [];
  for (const [key, value] of formData.entries()) {
    const orderMatch = key.match(/^player_(.+)_order$/);
    if (orderMatch) {
      const playerId = orderMatch[1];
      const order = parseInt(value as string, 10);
      const rawPosition = formData.get(`player_${playerId}_position`) as string | null;
      const dbPosition = rawPosition ? (POSITION_TO_DB[rawPosition] ?? rawPosition) : null;
      if (isNaN(order) || order < 1 || order > 9) {
        // Bench — still include pitchers so they can be identified as the starting pitcher.
        if (dbPosition === 'pitcher') {
          entries.push({ opponent_player_id: playerId, batting_order: null, starting_position: dbPosition });
        }
        continue;
      }
      entries.push({ opponent_player_id: playerId, batting_order: order, starting_position: dbPosition });
    }
  }

  // Validate no duplicate batting order spots (nulls are not compared)
  const orders = entries.map((e) => e.batting_order).filter((o): o is number => o !== null);
  if (orders.length !== new Set(orders).size) {
    return 'Duplicate batting order positions. Each spot (1–9) can only be assigned once.';
  }

  if (entries.length > 0) {
    // Delete first, then insert — only when we have data to replace so a failed
    // insert doesn't leave the lineup empty.
    const { error: deleteError } = await db
      .from('opponent_game_lineups')
      .delete()
      .eq('game_id', gameId);
    if (deleteError) return `Failed to clear lineup: ${deleteError.message}`;

    const { error: insertError } = await db.from('opponent_game_lineups').insert(
      entries.map((e) => ({ game_id: gameId, ...e, is_starter: true })),
    );
    if (insertError) return `Failed to save lineup: ${insertError.message}`;
  } else {
    await db.from('opponent_game_lineups').delete().eq('game_id', gameId);
  }

  revalidatePath(`/games/${gameId}/opponent-lineup`);
  revalidatePath(`/games/${gameId}`);
  return null;
}
