import type { SupabaseClient } from '@supabase/supabase-js';

/** Distinct season names across the league's teams, newest-name first. */
export async function listLeagueSeasons(db: SupabaseClient, teamIds: string[]): Promise<string[]> {
  if (teamIds.length === 0) return [];
  const { data, error } = await db.from('seasons').select('name').in('team_id', teamIds);
  if (error) throw new Error(`listLeagueSeasons failed: ${error.message}`);
  const names = Array.from(new Set((data ?? []).map((r: { name: string }) => r.name)));
  return names.sort((a, b) => b.localeCompare(a));
}

/**
 * Game ids for a league-season = completed games of the league's teams whose
 * per-team season shares the given season name.
 */
export async function resolveLeagueSeasonGameIds(
  db: SupabaseClient,
  teamIds: string[],
  season: string,
): Promise<string[]> {
  if (teamIds.length === 0) return [];
  const { data: seasonRows, error: sErr } = await db
    .from('seasons')
    .select('id')
    .in('team_id', teamIds)
    .eq('name', season);
  if (sErr) throw new Error(`resolve seasons failed: ${sErr.message}`);
  const seasonIds = (seasonRows ?? []).map((r: { id: string }) => r.id);
  if (seasonIds.length === 0) return [];
  const { data: gameRows, error: gErr } = await db
    .from('games')
    .select('id')
    .in('season_id', seasonIds)
    .eq('status', 'completed');
  if (gErr) throw new Error(`resolve games failed: ${gErr.message}`);
  return (gameRows ?? []).map((r: { id: string }) => r.id);
}
