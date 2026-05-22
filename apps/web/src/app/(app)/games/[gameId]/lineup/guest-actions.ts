'use server';

import { revalidatePath } from 'next/cache';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { getMaxBattingOrder } from '@baseball/shared';
import type { Database } from '@baseball/database';
import { getLeagueSettingsForTeam } from '@/lib/league-settings';

const COACH_ROLES = ['head_coach', 'assistant_coach', 'athletic_director'];

interface CoachContext {
  userId: string;
  teamId: string;
  leagueId: string | null;
  db: SupabaseClient<Database>;
}

async function getCoachContext(gameId: string): Promise<CoachContext | { error: string }> {
  const auth = createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return { error: 'Not authenticated.' };

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return { error: 'Server misconfigured.' };

  const db = createClient<Database>(supabaseUrl, serviceRoleKey);
  const { data: game } = await db
    .from('games')
    .select('team_id')
    .eq('id', gameId)
    .maybeSingle();
  if (!game?.team_id) return { error: 'Game not found.' };

  const { data: membership } = await db
    .from('team_members')
    .select('role')
    .eq('team_id', game.team_id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!membership || !COACH_ROLES.includes(membership.role)) {
    return { error: 'Only coaches can edit the lineup.' };
  }

  const { data: leagueRow } = await db
    .from('league_members')
    .select('league_id')
    .eq('team_id', game.team_id)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  return {
    userId: user.id,
    teamId: game.team_id,
    leagueId: leagueRow?.league_id ?? null,
    db,
  };
}

async function nextBattingOrder(
  db: SupabaseClient<Database>,
  gameId: string,
): Promise<number> {
  const { data } = await db
    .from('game_lineups')
    .select('batting_order')
    .eq('game_id', gameId)
    .not('batting_order', 'is', null)
    .order('batting_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.batting_order ?? 0) + 1;
}

/**
 * Add a guest lineup slot pointing to an existing players row (cross-team
 * guest from any team in the system, including other leagues).
 */
export async function addExistingGuestToLineupAction(input: {
  gameId: string;
  playerId: string;
  countTowardStats: boolean;
}): Promise<{ ok: true } | { error: string }> {
  const ctx = await getCoachContext(input.gameId);
  if ('error' in ctx) return { error: ctx.error };

  const settings = await getLeagueSettingsForTeam(ctx.db, ctx.teamId);
  if (!settings.guests.allowed) return { error: 'League does not allow guest players.' };

  const maxBatters = getMaxBattingOrder(settings);
  const order = await nextBattingOrder(ctx.db, input.gameId);
  if (order > maxBatters) {
    return { error: `Lineup is full (max ${maxBatters}).` };
  }

  const { error: insertError } = await ctx.db.from('game_lineups').insert({
    game_id: input.gameId,
    player_id: input.playerId,
    batting_order: order,
    is_guest: true,
    count_toward_stats: input.countTowardStats,
    is_starter: false,
  });
  if (insertError) return { error: insertError.message };

  if (ctx.leagueId) {
    await ctx.db
      .from('league_players')
      .upsert(
        { league_id: ctx.leagueId, player_id: input.playerId },
        { onConflict: 'league_id,player_id', ignoreDuplicates: true },
      );
  }

  revalidatePath(`/games/${input.gameId}/lineup`);
  return { ok: true };
}

/**
 * Create a brand-new guest identity (no team affiliation) and add them to
 * the lineup in one go. Used when the guest doesn't exist anywhere yet.
 */
export async function addNewGuestToLineupAction(input: {
  gameId: string;
  firstName: string;
  lastName: string;
  jerseyNumber?: number | null;
  countTowardStats: boolean;
}): Promise<{ ok: true } | { error: string }> {
  const ctx = await getCoachContext(input.gameId);
  if ('error' in ctx) return { error: ctx.error };

  const settings = await getLeagueSettingsForTeam(ctx.db, ctx.teamId);
  if (!settings.guests.allowed) return { error: 'League does not allow guest players.' };

  const trimmedFirst = input.firstName.trim();
  const trimmedLast = input.lastName.trim();
  if (!trimmedFirst || !trimmedLast) return { error: 'First and last name are required.' };

  const maxBatters = getMaxBattingOrder(settings);
  const order = await nextBattingOrder(ctx.db, input.gameId);
  if (order > maxBatters) return { error: `Lineup is full (max ${maxBatters}).` };

  const { data: newPlayer, error: playerErr } = await ctx.db
    .from('players')
    .insert({
      team_id: null,
      first_name: trimmedFirst,
      last_name: trimmedLast,
      jersey_number: input.jerseyNumber ?? null,
      is_guest_only: true,
      is_active: true,
    })
    .select('id')
    .single();
  if (playerErr || !newPlayer) return { error: playerErr?.message ?? 'Could not create guest player.' };

  const { error: lineupErr } = await ctx.db.from('game_lineups').insert({
    game_id: input.gameId,
    player_id: newPlayer.id,
    batting_order: order,
    is_guest: true,
    guest_display_name: `${trimmedFirst} ${trimmedLast}`,
    count_toward_stats: input.countTowardStats,
    is_starter: false,
  });
  if (lineupErr) {
    await ctx.db.from('players').delete().eq('id', newPlayer.id);
    return { error: lineupErr.message };
  }

  if (ctx.leagueId) {
    await ctx.db
      .from('league_players')
      .upsert(
        { league_id: ctx.leagueId, player_id: newPlayer.id },
        { onConflict: 'league_id,player_id', ignoreDuplicates: true },
      );
  }

  revalidatePath(`/games/${input.gameId}/lineup`);
  return { ok: true };
}

export async function removeGuestFromLineupAction(input: {
  gameId: string;
  lineupId: string;
}): Promise<{ ok: true } | { error: string }> {
  const ctx = await getCoachContext(input.gameId);
  if ('error' in ctx) return { error: ctx.error };

  const { error } = await ctx.db
    .from('game_lineups')
    .delete()
    .eq('id', input.lineupId)
    .eq('game_id', input.gameId)
    .eq('is_guest', true);
  if (error) return { error: error.message };

  revalidatePath(`/games/${input.gameId}/lineup`);
  return { ok: true };
}

/**
 * Search the league's all-time guest-player pool (everyone who has appeared
 * in any league game) plus any other-team rostered players the coach knows
 * about. Used by the GuestPlayerPicker.
 */
export async function searchGuestCandidatesAction(input: {
  gameId: string;
  query: string;
  limit?: number;
}): Promise<{
  candidates: Array<{
    id: string;
    firstName: string;
    lastName: string;
    jerseyNumber: number | null;
    sourceLabel: string;
  }>;
} | { error: string }> {
  const ctx = await getCoachContext(input.gameId);
  if ('error' in ctx) return { error: ctx.error };

  const query = input.query.trim().toLowerCase();
  const limit = Math.min(input.limit ?? 25, 50);

  // 1) league_players from the team's league (if any)
  const leagueIds = new Set<string>();
  if (ctx.leagueId) leagueIds.add(ctx.leagueId);

  const candidates: Array<{
    id: string;
    firstName: string;
    lastName: string;
    jerseyNumber: number | null;
    sourceLabel: string;
  }> = [];

  if (ctx.leagueId) {
    const { data: leaguePlayers } = await ctx.db
      .from('league_players')
      .select('player_id, players(id, first_name, last_name, jersey_number, team_id)')
      .eq('league_id', ctx.leagueId)
      .limit(limit);
    for (const row of leaguePlayers ?? []) {
      const p = Array.isArray(row.players) ? row.players[0] : row.players;
      if (!p) continue;
      const fullName = `${p.first_name} ${p.last_name}`.toLowerCase();
      if (query && !fullName.includes(query)) continue;
      candidates.push({
        id: p.id,
        firstName: p.first_name,
        lastName: p.last_name,
        jerseyNumber: p.jersey_number,
        sourceLabel: 'League history',
      });
    }
  }

  // 2) Players from other teams (small ad-hoc search across system roster).
  // We cap at `limit` total, so this fills only if the league pool is short.
  // Sanitize the query against PostgREST's `.or()` syntax: commas and
  // parentheses are delimiters, so strip anything that isn't a letter,
  // digit, space, hyphen, or apostrophe.
  const safeQuery = query.replace(/[^a-z0-9 '\-]/gi, '');
  if (candidates.length < limit && safeQuery.length >= 2) {
    const remaining = limit - candidates.length;
    const { data: systemPlayers } = await ctx.db
      .from('players')
      .select('id, first_name, last_name, jersey_number, team_id')
      .neq('team_id', ctx.teamId)
      .eq('is_active', true)
      .or(`first_name.ilike.%${safeQuery}%,last_name.ilike.%${safeQuery}%`)
      .limit(remaining);
    const knownIds = new Set(candidates.map((c) => c.id));
    for (const p of systemPlayers ?? []) {
      if (knownIds.has(p.id)) continue;
      candidates.push({
        id: p.id,
        firstName: p.first_name,
        lastName: p.last_name,
        jerseyNumber: p.jersey_number,
        sourceLabel: p.team_id ? 'Other team' : 'Guest pool',
      });
    }
  }

  return { candidates };
}
