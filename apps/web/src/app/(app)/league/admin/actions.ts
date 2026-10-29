'use server';

import { revalidatePath } from 'next/cache';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import {
  addLeagueDivision,
  removeLeagueDivision,
  removeLeagueTeam,
  setLeagueTeamActive,
  setLeagueTeamDivision,
} from '@/lib/services/league-admin/league-teams';
import { removeLeagueStaff } from '@/lib/services/league-admin/league-staff';
import type { ServiceResult } from '@/lib/services/result';

// Thin wrappers over lib/services/league-admin/league-teams and league-staff,
// shared with the mobile /api/m/v1/league-admin/:leagueId/teams|divisions|staff
// routes; each returns an error message or null.

async function run<T>(action: (db: SupabaseClient, userId: string) => Promise<ServiceResult<T>>): Promise<string | null> {
  const auth = createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return 'Not authenticated — please log in again.';

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const result = await action(db, user.id);
  if (!result.ok) return result.error;

  revalidatePath('/league/admin');
  return null;
}

export async function addLeagueDivisionAction(leagueId: string, name: string): Promise<string | null> {
  return run((db, userId) => addLeagueDivision(db, userId, { leagueId, name }));
}

export async function removeLeagueDivisionAction(leagueId: string, divisionId: string): Promise<string | null> {
  return run((db, userId) => removeLeagueDivision(db, userId, { leagueId, divisionId }));
}

export async function setLeagueTeamDivisionAction(
  leagueId: string,
  membershipId: string,
  divisionId: string | null,
): Promise<string | null> {
  return run((db, userId) => setLeagueTeamDivision(db, userId, { leagueId, membershipId, divisionId }));
}

export async function setLeagueTeamActiveAction(leagueId: string, membershipId: string, isActive: boolean): Promise<string | null> {
  return run((db, userId) => setLeagueTeamActive(db, userId, { leagueId, membershipId, isActive }));
}

export async function removeLeagueTeamAction(leagueId: string, membershipId: string): Promise<string | null> {
  return run((db, userId) => removeLeagueTeam(db, userId, { leagueId, membershipId }));
}

export async function removeLeagueStaffAction(leagueId: string, staffId: string): Promise<string | null> {
  return run((db, userId) => removeLeagueStaff(db, userId, { leagueId, staffId }));
}
