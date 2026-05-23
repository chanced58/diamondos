'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { getLeagueAccess } from '@/lib/league-access';
import {
  createLeaguePlayerSchema, transferPlayerSchema,
  releasePlayerSchema, updateLeaguePlayerSchema,
  type CreateLeaguePlayerInput, type TransferPlayerInput,
  type ReleasePlayerInput, type UpdateLeaguePlayerInput,
} from '@baseball/shared';

type Result<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string; meta?: Record<string, unknown> };

function service() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function requireLeagueAdmin(
  leagueId: string,
): Promise<{ user: { id: string } } | { error: string }> {
  const auth = createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return { error: 'NOT_AUTHENTICATED' };
  const access = await getLeagueAccess(leagueId, user.id);
  if (!access.isLeagueAdmin) return { error: 'FORBIDDEN' };
  return { user };
}

function parsePgError(message: string): { code: string; meta?: Record<string, unknown> } {
  if (message.startsWith('IN_PROGRESS_GAME:')) {
    return { code: 'IN_PROGRESS_GAME', meta: { gameId: message.split(':')[1]?.trim() } };
  }
  if (message.startsWith('JERSEY_CONFLICT:')) {
    return {
      code: 'JERSEY_CONFLICT',
      meta: { conflictingPlayerName: message.replace(/^JERSEY_CONFLICT:\s*/, '') },
    };
  }
  if (message === 'FORBIDDEN') return { code: 'FORBIDDEN' };
  if (message === 'NOT_IN_LEAGUE') return { code: 'NOT_IN_LEAGUE' };
  if (message === 'TEAM_NOT_IN_LEAGUE') return { code: 'TEAM_NOT_IN_LEAGUE' };
  if (message === 'TO_TEAM_REQUIRED') return { code: 'TO_TEAM_REQUIRED' };
  if (message === 'NOT_ON_TEAM') return { code: 'NOT_ON_TEAM' };
  return { code: 'UNKNOWN' };
}

export async function createLeaguePlayer(
  input: CreateLeaguePlayerInput,
): Promise<Result<{ playerId: string }>> {
  const parsed = createLeaguePlayerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: 'VALIDATION', message: parsed.error.message };

  const auth = await requireLeagueAdmin(parsed.data.leagueId);
  if ('error' in auth) return { ok: false, code: auth.error, message: auth.error };

  const db = service();
  const { data, error } = await db.rpc('fn_create_league_player', {
    p_league_id: parsed.data.leagueId,
    p_first_name: parsed.data.firstName,
    p_last_name: parsed.data.lastName,
    p_date_of_birth: parsed.data.dateOfBirth ?? null,
    p_jersey_number: parsed.data.jerseyNumber ?? null,
    p_primary_position: parsed.data.primaryPosition ?? null,
    p_bats: parsed.data.bats ?? null,
    p_throws: parsed.data.throws ?? null,
    p_graduation_year: parsed.data.graduationYear ?? null,
    p_notes: parsed.data.notes ?? null,
    p_team_id: parsed.data.teamId ?? null,
    p_actor: auth.user.id,
  });
  if (error) {
    const e = parsePgError(error.message);
    return { ok: false, code: e.code, message: error.message, meta: e.meta };
  }

  revalidatePath('/league/admin/players');
  return { ok: true, data: { playerId: (data as { id: string }).id } };
}

export async function transferPlayer(
  input: TransferPlayerInput,
): Promise<Result<{ transferId: string }>> {
  const parsed = transferPlayerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: 'VALIDATION', message: parsed.error.message };

  const auth = await requireLeagueAdmin(parsed.data.leagueId);
  if ('error' in auth) return { ok: false, code: auth.error, message: auth.error };

  const db = service();
  const { data, error } = await db.rpc('fn_transfer_player', {
    p_league_id: parsed.data.leagueId,
    p_player_id: parsed.data.playerId,
    p_to_team_id: parsed.data.toTeamId,
    p_effective_at: parsed.data.effectiveAt ?? null,
    p_reason: parsed.data.reason ?? null,
    p_season_id: parsed.data.seasonId ?? null,
    p_accept_jersey_clear: parsed.data.acceptJerseyClear,
    p_actor: auth.user.id,
  });
  if (error) {
    const e = parsePgError(error.message);
    return { ok: false, code: e.code, message: error.message, meta: e.meta };
  }

  revalidatePath('/league/admin/players');
  return { ok: true, data: { transferId: (data as { id: string }).id } };
}

export async function releasePlayer(
  input: ReleasePlayerInput,
): Promise<Result<{ transferId: string }>> {
  const parsed = releasePlayerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: 'VALIDATION', message: parsed.error.message };

  const auth = await requireLeagueAdmin(parsed.data.leagueId);
  if ('error' in auth) return { ok: false, code: auth.error, message: auth.error };

  const db = service();
  const { data, error } = await db.rpc('fn_release_player', {
    p_league_id: parsed.data.leagueId,
    p_player_id: parsed.data.playerId,
    p_effective_at: parsed.data.effectiveAt ?? null,
    p_reason: parsed.data.reason ?? null,
    p_actor: auth.user.id,
  });
  if (error) {
    const e = parsePgError(error.message);
    return { ok: false, code: e.code, message: error.message, meta: e.meta };
  }

  revalidatePath('/league/admin/players');
  return { ok: true, data: { transferId: (data as { id: string }).id } };
}

export async function updateLeaguePlayer(
  leagueId: string,
  input: UpdateLeaguePlayerInput,
): Promise<Result<{ playerId: string }>> {
  const parsed = updateLeaguePlayerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: 'VALIDATION', message: parsed.error.message };

  const auth = await requireLeagueAdmin(leagueId);
  if ('error' in auth) return { ok: false, code: auth.error, message: auth.error };

  const db = service();
  const updates: Record<string, unknown> = {};
  const map: Record<string, string> = {
    firstName: 'first_name', lastName: 'last_name', dateOfBirth: 'date_of_birth',
    jerseyNumber: 'jersey_number', primaryPosition: 'primary_position',
    bats: 'bats', throws: 'throws', graduationYear: 'graduation_year', notes: 'notes',
  };
  for (const [k, v] of Object.entries(parsed.data)) {
    if (k === 'playerId') continue;
    if (v === undefined) continue;
    const dbCol = map[k];
    if (dbCol) updates[dbCol] = v;
  }
  if (Object.keys(updates).length === 0) {
    return { ok: true, data: { playerId: parsed.data.playerId } };
  }

  const { error } = await db.from('players').update(updates).eq('id', parsed.data.playerId);
  if (error) return { ok: false, code: 'DB_ERROR', message: error.message };

  revalidatePath('/league/admin/players');
  revalidatePath(`/league/admin/players/${parsed.data.playerId}`);
  return { ok: true, data: { playerId: parsed.data.playerId } };
}
