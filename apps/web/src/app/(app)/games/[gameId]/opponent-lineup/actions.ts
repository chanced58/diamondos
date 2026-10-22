'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import type { ServiceResult } from '@/lib/services/result';
import { saveOpponentTeam } from '@/lib/services/opponent-lineup/opponent-team';
import {
  addOpponentPlayer,
  removeOpponentPlayer,
  updateOpponentPlayer,
} from '@/lib/services/opponent-lineup/opponent-roster';
import {
  autoFillOpponentLineup,
  saveOpponentLineup,
} from '@/lib/services/opponent-lineup/opponent-batting-order';

/** The form's position abbreviations, as player_position enum values. */
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

/** Runs a service as the signed-in coach; returns the form's error message, or null. */
async function runAsUser(
  gameId: string,
  run: (db: ReturnType<typeof serviceClient>, userId: string) => Promise<ServiceResult<unknown>>,
): Promise<string | null> {
  const auth = createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return 'Not authenticated.';

  const result = await run(serviceClient(), user.id);
  if (!result.ok) return result.error;

  revalidatePath(`/games/${gameId}/opponent-lineup`);
  revalidatePath(`/games/${gameId}`);
  return null;
}

function positionFrom(formData: FormData, key: string): string | null {
  const raw = formData.get(key) as string | null;
  return raw ? (POSITION_TO_DB[raw] ?? null) : null;
}

function playerFields(formData: FormData) {
  return {
    firstName: (formData.get('firstName') as string | null) ?? '',
    lastName: (formData.get('lastName') as string | null) ?? '',
    jerseyNumber: (formData.get('jerseyNumber') as string | null) ?? null,
    primaryPosition: positionFrom(formData, 'primaryPosition'),
  };
}

/** Create the game's opponent team record and link it, or rename the linked one. */
export async function saveOpponentTeamAction(
  _prevState: string | null | undefined,
  formData: FormData,
): Promise<string | null> {
  const gameId = formData.get('gameId') as string;
  return runAsUser(gameId, (db, userId) =>
    saveOpponentTeam(db, userId, { gameId, name: (formData.get('teamName') as string | null) ?? '' }),
  );
}

/** Add a player to the game's opponent roster. */
export async function addOpponentPlayerAction(
  _prevState: string | null | undefined,
  formData: FormData,
): Promise<string | null> {
  const gameId = formData.get('gameId') as string;
  return runAsUser(gameId, (db, userId) => addOpponentPlayer(db, userId, { gameId, ...playerFields(formData) }));
}

/** Remove a player from the opponent roster (soft delete; stats are kept). */
export async function removeOpponentPlayerAction(
  _prevState: string | null | undefined,
  formData: FormData,
): Promise<string | null> {
  const gameId = formData.get('gameId') as string;
  return runAsUser(gameId, (db, userId) =>
    removeOpponentPlayer(db, userId, { gameId, playerId: formData.get('playerId') }),
  );
}

/** Update an opponent player's name, jersey number and position. */
export async function updateOpponentPlayerAction(
  _prevState: string | null | undefined,
  formData: FormData,
): Promise<string | null> {
  const gameId = formData.get('gameId') as string;
  return runAsUser(gameId, (db, userId) =>
    updateOpponentPlayer(db, userId, { gameId, playerId: formData.get('playerId'), ...playerFields(formData) }),
  );
}

/** Seed the game's order from the opponent roster, everyone on the bench. */
export async function autoFillLineupFromRosterAction(
  _prevState: string | null | undefined,
  formData: FormData,
): Promise<string | null> {
  const gameId = formData.get('gameId') as string;
  return runAsUser(gameId, (db, userId) => autoFillOpponentLineup(db, userId, { gameId }));
}

/** Save the opponent batting order and starting positions (fields: player_<id>_order / _position). */
export async function saveOpponentLineupAction(
  _prevState: string | null | undefined,
  formData: FormData,
): Promise<string | null> {
  const gameId = formData.get('gameId') as string;

  const entries: { opponentPlayerId: string; battingOrder: number | null; startingPosition: string | null }[] = [];
  for (const [key, value] of formData.entries()) {
    const match = key.match(/^player_(.+)_order$/);
    if (!match) continue;
    const playerId = match[1];
    const order = parseInt(value as string, 10);
    entries.push({
      opponentPlayerId: playerId,
      battingOrder: Number.isNaN(order) ? null : order,
      startingPosition: positionFrom(formData, `player_${playerId}_position`),
    });
  }

  return runAsUser(gameId, (db, userId) => saveOpponentLineup(db, userId, { gameId, entries }));
}
