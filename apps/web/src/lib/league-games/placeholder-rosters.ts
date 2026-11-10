import type { SupabaseClient } from '@supabase/supabase-js';

export interface RosterOption {
  id: string;
  name: string;
}

/** Active players of each team, by team id, for the "match to" pickers. */
export async function loadRosterOptions(db: SupabaseClient, teamIds: string[]): Promise<Record<string, RosterOption[]>> {
  const rosters: Record<string, RosterOption[]> = {};
  if (teamIds.length === 0) return rosters;
  const { data, error } = await db
    .from('players')
    .select('id, team_id, first_name, last_name, jersey_number')
    .in('team_id', Array.from(new Set(teamIds)))
    .eq('is_active', true)
    .order('last_name');
  if (error) {
    console.error('[league-placeholders] roster options read failed:', error);
    return rosters;
  }
  for (const player of (data ?? []) as { id: string; team_id: string; first_name: string; last_name: string; jersey_number: number | null }[]) {
    const number = player.jersey_number === null ? '' : `#${player.jersey_number} `;
    (rosters[player.team_id] ??= []).push({ id: player.id, name: `${number}${player.first_name} ${player.last_name}` });
  }
  return rosters;
}
