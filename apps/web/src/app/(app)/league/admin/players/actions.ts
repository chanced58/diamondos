'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { getLeagueAccess } from '@/lib/league-access';
import {
  updateLeaguePlayerSchema,
  type CreateLeaguePlayerInput, type TransferPlayerInput,
  type ReleasePlayerInput, type UpdateLeaguePlayerInput,
} from '@baseball/shared';
import {
  createLeaguePlayer as createLeaguePlayerService,
  releaseLeaguePlayer,
  transferLeaguePlayer,
} from '@/lib/services/league-admin/league-players';
import type { ServiceResult } from '@/lib/services/result';

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

async function actorId(): Promise<string | null> {
  const auth = createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  return user?.id ?? null;
}

/** The dialogs' result shape over a service result. */
function toResult<T>(result: ServiceResult<T>): Result<T> {
  return result.ok ? result : { ok: false, code: result.code, message: result.error };
}

const NOT_AUTHENTICATED = { ok: false, code: 'NOT_AUTHENTICATED', message: 'Not authenticated.' } as const;

// Create, transfer and release are thin wrappers over
// lib/services/league-admin/league-players, shared with the mobile
// /api/m/v1/league-admin/:leagueId/players routes.

export async function createLeaguePlayer(
  input: CreateLeaguePlayerInput,
): Promise<Result<{ playerId: string }>> {
  const userId = await actorId();
  if (!userId) return NOT_AUTHENTICATED;
  const result = await createLeaguePlayerService(service(), userId, input);
  if (result.ok) revalidatePath('/league/admin/players');
  return toResult(result);
}

export async function transferPlayer(
  input: TransferPlayerInput,
): Promise<Result<{ transferId: string }>> {
  const userId = await actorId();
  if (!userId) return NOT_AUTHENTICATED;
  const result = await transferLeaguePlayer(service(), userId, input);
  if (!result.ok) return toResult(result);
  if (result.data.status === 'jersey_conflict') {
    return {
      ok: false,
      code: 'JERSEY_CONFLICT',
      message: `Jersey is taken by ${result.data.conflictingPlayerName}.`,
      meta: { conflictingPlayerName: result.data.conflictingPlayerName },
    };
  }
  revalidatePath('/league/admin/players');
  return { ok: true, data: { transferId: result.data.transferId } };
}

export async function releasePlayer(
  input: ReleasePlayerInput,
): Promise<Result<{ transferId: string }>> {
  const userId = await actorId();
  if (!userId) return NOT_AUTHENTICATED;
  const result = await releaseLeaguePlayer(service(), userId, input);
  if (result.ok) revalidatePath('/league/admin/players');
  return toResult(result);
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

  // Verify the target player is registered in this league before mutating
  // via service role. Without this, a league_admin could craft a request
  // with their own leagueId but a foreign playerId and edit other leagues'
  // players.
  const { data: membership, error: membershipError } = await db
    .from('league_players')
    .select('player_id')
    .eq('league_id', leagueId)
    .eq('player_id', parsed.data.playerId)
    .maybeSingle();
  if (membershipError) {
    return { ok: false, code: 'DB_ERROR', message: membershipError.message };
  }
  if (!membership) {
    return { ok: false, code: 'NOT_IN_LEAGUE', message: 'NOT_IN_LEAGUE' };
  }

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
