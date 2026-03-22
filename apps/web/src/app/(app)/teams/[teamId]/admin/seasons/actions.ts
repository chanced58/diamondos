'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';

const ROSTER_ADMIN_ROLES = ['head_coach', 'assistant_coach', 'athletic_director'] as const;

async function getAuthorizedCoach(teamId: string) {
  const authClient = createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated — please log in again.' };

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('is_platform_admin')
    .eq('id', user.id)
    .single();

  if (profile?.is_platform_admin) return { supabase, user };

  const { data: membership } = await supabase
    .from('team_members')
    .select('role')
    .eq('team_id', teamId)
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle();

  if (!membership || !ROSTER_ADMIN_ROLES.includes(membership.role as typeof ROSTER_ADMIN_ROLES[number])) {
    return { error: 'Only coaches can manage seasons.' };
  }

  return { supabase, user };
}

const SEASON_DATES: Record<string, { startMonth: number; startDay: number; endMonth: number; endDay: number }> = {
  Spring: { startMonth: 3, startDay: 1, endMonth: 5, endDay: 31 },
  Summer: { startMonth: 6, startDay: 1, endMonth: 8, endDay: 31 },
  Fall:   { startMonth: 9, startDay: 1, endMonth: 11, endDay: 30 },
};

export async function createSeasonAction(
  _prevState: string | null | undefined,
  formData: FormData,
): Promise<string | null> {
  const teamId = formData.get('teamId') as string;
  const result = await getAuthorizedCoach(teamId);
  if ('error' in result) return result.error ?? null;
  const { supabase } = result;

  const seasonName = formData.get('seasonName') as string;
  const yearStr = formData.get('year') as string;

  if (!seasonName || !SEASON_DATES[seasonName]) return 'Invalid season name.';
  const year = parseInt(yearStr, 10);
  if (isNaN(year)) return 'Invalid year.';

  const name = `${seasonName} ${year}`;
  const dates = SEASON_DATES[seasonName];
  const startDate = `${year}-${String(dates.startMonth).padStart(2, '0')}-${String(dates.startDay).padStart(2, '0')}`;
  const endDate = `${year}-${String(dates.endMonth).padStart(2, '0')}-${String(dates.endDay).padStart(2, '0')}`;

  // Check for duplicate
  const { data: existing } = await supabase
    .from('seasons')
    .select('id')
    .eq('team_id', teamId)
    .eq('name', name)
    .maybeSingle();

  if (existing) return `${name} already exists.`;

  const { error } = await supabase
    .from('seasons')
    .insert({
      team_id: teamId,
      name,
      start_date: startDate,
      end_date: endDate,
      is_active: false,
    });

  if (error) return `Failed to create season: ${error.message}`;

  revalidatePath(`/teams/${teamId}/admin/seasons`);
  return null;
}

export async function setActiveSeasonAction(
  _prevState: string | null | undefined,
  formData: FormData,
): Promise<string | null> {
  const teamId = formData.get('teamId') as string;
  const result = await getAuthorizedCoach(teamId);
  if ('error' in result) return result.error ?? null;
  const { supabase } = result;

  const seasonId = formData.get('seasonId') as string;
  if (!seasonId) return 'Missing season ID.';

  // Deactivate current active season
  await supabase
    .from('seasons')
    .update({ is_active: false })
    .eq('team_id', teamId)
    .eq('is_active', true);

  // Activate target season
  const { error } = await supabase
    .from('seasons')
    .update({ is_active: true })
    .eq('id', seasonId)
    .eq('team_id', teamId);

  if (error) return `Failed to activate season: ${error.message}`;

  revalidatePath(`/teams/${teamId}/admin/seasons`);
  revalidatePath('/compliance');
  return null;
}

export async function deactivateSeasonAction(
  _prevState: string | null | undefined,
  formData: FormData,
): Promise<string | null> {
  const teamId = formData.get('teamId') as string;
  const result = await getAuthorizedCoach(teamId);
  if ('error' in result) return result.error ?? null;
  const { supabase } = result;

  const seasonId = formData.get('seasonId') as string;
  if (!seasonId) return 'Missing season ID.';

  const { error } = await supabase
    .from('seasons')
    .update({ is_active: false })
    .eq('id', seasonId)
    .eq('team_id', teamId);

  if (error) return `Failed to deactivate season: ${error.message}`;

  revalidatePath(`/teams/${teamId}/admin/seasons`);
  revalidatePath('/compliance');
  return null;
}
