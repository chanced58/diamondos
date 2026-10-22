'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import {
  addOpponentTeamPlayer,
  createOpponentTeam,
  removeOpponentTeamPlayer,
  updateOpponentTeam,
} from '@/lib/services/opponent-teams/opponent-teams';

/**
 * Opponent team forms — thin wrappers over `lib/services/opponent-teams`,
 * which the mobile `/api/m/v1/.../opponent-teams` routes share: the services
 * validate, authorize the coach and scope every write to the owning team.
 */

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

async function currentUserId(): Promise<string | null> {
  const auth = createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  return user?.id ?? null;
}

function text(formData: FormData, field: string): string | null {
  return (formData.get(field) as string | null)?.trim() || null;
}

export async function createOpponentTeamAction(
  _prevState: string | null | undefined,
  formData: FormData,
): Promise<string | null> {
  const userId = await currentUserId();
  if (!userId) return 'Not authorized.';

  const result = await createOpponentTeam(serviceClient(), userId, {
    teamId: formData.get('teamId'),
    name: text(formData, 'name') ?? '',
    abbreviation: text(formData, 'abbreviation'),
    city: text(formData, 'city'),
    stateCode: text(formData, 'stateCode'),
  });
  if (!result.ok) return result.error;

  redirect(`/games/opponents/${result.data.opponentTeamId}`);
}

export async function updateOpponentTeamAction(
  _prevState: string | null | undefined,
  formData: FormData,
): Promise<string | null> {
  const userId = await currentUserId();
  if (!userId) return 'Not authorized.';

  const opponentTeamId = formData.get('opponentTeamId') as string;
  const result = await updateOpponentTeam(serviceClient(), userId, {
    opponentTeamId,
    name: text(formData, 'name') ?? '',
    abbreviation: text(formData, 'abbreviation'),
    city: text(formData, 'city'),
    stateCode: text(formData, 'stateCode'),
  });
  if (!result.ok) return result.error;

  revalidatePath(`/games/opponents/${opponentTeamId}`);
  revalidatePath('/games/opponents');
  return null;
}

export async function addPlayerAction(
  _prevState: string | null | undefined,
  formData: FormData,
): Promise<string | null> {
  const userId = await currentUserId();
  if (!userId) return 'Not authorized.';

  const opponentTeamId = formData.get('opponentTeamId') as string;
  const rawPosition = formData.get('primaryPosition') as string | null;
  const result = await addOpponentTeamPlayer(serviceClient(), userId, {
    opponentTeamId,
    firstName: text(formData, 'firstName') ?? '',
    lastName: text(formData, 'lastName') ?? '',
    jerseyNumber: text(formData, 'jerseyNumber'),
    primaryPosition: rawPosition ? (POSITION_TO_DB[rawPosition] ?? null) : null,
    bats: text(formData, 'bats'),
    throws: text(formData, 'throws'),
  });
  if (!result.ok) return result.error;

  revalidatePath(`/games/opponents/${opponentTeamId}`);
  return null;
}

export async function removePlayerAction(
  _prevState: string | null | undefined,
  formData: FormData,
): Promise<string | null> {
  const userId = await currentUserId();
  if (!userId) return 'Not authorized.';

  const opponentTeamId = formData.get('opponentTeamId') as string;
  const result = await removeOpponentTeamPlayer(serviceClient(), userId, {
    opponentTeamId,
    playerId: formData.get('playerId'),
  });
  if (!result.ok) return result.error;

  revalidatePath(`/games/opponents/${opponentTeamId}`);
  return null;
}
