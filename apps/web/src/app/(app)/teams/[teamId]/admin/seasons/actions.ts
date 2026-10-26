'use server';

import { revalidatePath } from 'next/cache';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { createTeamSeason, deactivateTeamSeason, setActiveTeamSeason } from '@/lib/services/seasons/team-seasons';
import type { ServiceResult } from '@/lib/services/result';

// Thin wrappers over lib/services/seasons, shared with the mobile
// /api/m/v1/teams/:teamId/seasons routes; each returns an error message or null.

async function run<T>(
  teamId: string,
  action: (db: SupabaseClient, userId: string) => Promise<ServiceResult<T>>,
): Promise<string | null> {
  const authClient = createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return 'Not authenticated — please log in again.';

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const result = await action(db, user.id);
  if (!result.ok) return result.error;

  revalidatePath(`/teams/${teamId}/admin/seasons`);
  revalidatePath('/compliance');
  return null;
}

export async function createSeasonAction(
  _prevState: string | null | undefined,
  formData: FormData,
): Promise<string | null> {
  const teamId = formData.get('teamId') as string;
  const input = { teamId, term: formData.get('seasonName'), year: Number(formData.get('year')) };
  return run(teamId, (db, userId) => createTeamSeason(db, userId, input));
}

export async function setActiveSeasonAction(
  _prevState: string | null | undefined,
  formData: FormData,
): Promise<string | null> {
  const teamId = formData.get('teamId') as string;
  const input = { teamId, seasonId: formData.get('seasonId') };
  return run(teamId, (db, userId) => setActiveTeamSeason(db, userId, input));
}

export async function deactivateSeasonAction(
  _prevState: string | null | undefined,
  formData: FormData,
): Promise<string | null> {
  const teamId = formData.get('teamId') as string;
  const input = { teamId, seasonId: formData.get('seasonId') };
  return run(teamId, (db, userId) => deactivateTeamSeason(db, userId, input));
}
