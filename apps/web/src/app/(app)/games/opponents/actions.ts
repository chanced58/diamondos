'use server';

import { redirect } from 'next/navigation';
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

async function getCoachContextForTeam(teamId: string) {
  const auth = createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return null;

  const db = serviceClient();
  const { data: membership } = await db
    .from('team_members')
    .select('role')
    .eq('team_id', teamId)
    .eq('user_id', user.id)
    .single();

  if (!membership || !COACH_ROLES.includes(membership.role)) return null;
  return { user, db, teamId };
}

async function getCoachContextForOpponentTeam(opponentTeamId: string) {
  const auth = createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return null;

  const db = serviceClient();

  // Fetch the opponent team and verify it's team-owned
  const { data: team } = await db
    .from('opponent_teams')
    .select('id, team_id, name')
    .eq('id', opponentTeamId)
    .single();
  if (!team || !team.team_id) return null;

  const { data: membership } = await db
    .from('team_members')
    .select('role')
    .eq('team_id', team.team_id)
    .eq('user_id', user.id)
    .single();

  if (!membership || !COACH_ROLES.includes(membership.role)) return null;
  return { user, db, teamId: team.team_id, opponentTeamId: team.id };
}

export async function createOpponentTeamAction(
  _prevState: string | null | undefined,
  formData: FormData,
): Promise<string | null> {
  const teamId = formData.get('teamId') as string;
  const name = (formData.get('name') as string | null)?.trim();
  const abbreviation = (formData.get('abbreviation') as string | null)?.trim() || null;
  const city = (formData.get('city') as string | null)?.trim() || null;
  const stateCode = (formData.get('stateCode') as string | null)?.trim() || null;

  if (!name) return 'Team name is required.';

  const ctx = await getCoachContextForTeam(teamId);
  if (!ctx) return 'Not authorized.';

  const { data: newTeam, error } = await ctx.db
    .from('opponent_teams')
    .insert({
      team_id: teamId,
      name,
      abbreviation,
      city,
      state_code: stateCode,
      created_by: ctx.user.id,
    })
    .select('id')
    .single();

  if (error) return `Failed to create team: ${error.message}`;

  redirect(`/games/opponents/${newTeam.id}`);
}

export async function updateOpponentTeamAction(
  _prevState: string | null | undefined,
  formData: FormData,
): Promise<string | null> {
  const opponentTeamId = formData.get('opponentTeamId') as string;
  const name = (formData.get('name') as string | null)?.trim();
  const abbreviation = (formData.get('abbreviation') as string | null)?.trim() || null;
  const city = (formData.get('city') as string | null)?.trim() || null;
  const stateCode = (formData.get('stateCode') as string | null)?.trim() || null;

  if (!name) return 'Team name is required.';

  const ctx = await getCoachContextForOpponentTeam(opponentTeamId);
  if (!ctx) return 'Not authorized.';

  const { error } = await ctx.db
    .from('opponent_teams')
    .update({
      name,
      abbreviation,
      city,
      state_code: stateCode,
      updated_at: new Date().toISOString(),
    })
    .eq('id', opponentTeamId);

  if (error) return `Failed to update team: ${error.message}`;

  revalidatePath(`/games/opponents/${opponentTeamId}`);
  revalidatePath('/games/opponents');
  return null;
}

export async function addPlayerAction(
  _prevState: string | null | undefined,
  formData: FormData,
): Promise<string | null> {
  const opponentTeamId = formData.get('opponentTeamId') as string;
  const firstName = (formData.get('firstName') as string | null)?.trim();
  const lastName = (formData.get('lastName') as string | null)?.trim();
  const jerseyNumber = (formData.get('jerseyNumber') as string | null)?.trim() || null;
  const rawPosition = formData.get('primaryPosition') as string | null;
  const primaryPosition = rawPosition ? (POSITION_TO_DB[rawPosition] ?? null) : null;
  const bats = (formData.get('bats') as string | null) || null;
  const throws_ = (formData.get('throws') as string | null) || null;

  if (!firstName || !lastName) return 'First and last name are required.';

  const ctx = await getCoachContextForOpponentTeam(opponentTeamId);
  if (!ctx) return 'Not authorized.';

  const { error } = await ctx.db.from('opponent_players').insert({
    opponent_team_id: opponentTeamId,
    first_name: firstName,
    last_name: lastName,
    jersey_number: jerseyNumber,
    primary_position: primaryPosition,
    bats,
    throws: throws_,
  });

  if (error) return `Failed to add player: ${error.message}`;

  revalidatePath(`/games/opponents/${opponentTeamId}`);
  return null;
}

export async function removePlayerAction(
  _prevState: string | null | undefined,
  formData: FormData,
): Promise<string | null> {
  const opponentTeamId = formData.get('opponentTeamId') as string;
  const playerId = formData.get('playerId') as string;

  const ctx = await getCoachContextForOpponentTeam(opponentTeamId);
  if (!ctx) return 'Not authorized.';

  const { error } = await ctx.db
    .from('opponent_players')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', playerId)
    .eq('opponent_team_id', opponentTeamId);

  if (error) return `Failed to remove player: ${error.message}`;

  revalidatePath(`/games/opponents/${opponentTeamId}`);
  return null;
}
