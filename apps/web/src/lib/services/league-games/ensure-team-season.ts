import type { SupabaseClient } from '@supabase/supabase-js';
import { seasonFor, SEASON_TERMS, type SeasonTerm } from '@baseball/shared';

const SEASON_NAME = /^(Spring|Summer|Fall) (\d{4})$/;

function isSeasonTerm(value: string): value is SeasonTerm {
  return (SEASON_TERMS as readonly string[]).includes(value);
}

/**
 * The id of the team's season with this name, created inactive when missing.
 * A name like "Spring 2027" gets that season's fixed dates; any other name
 * starts on `fallbackStart` (`YYYY-MM-DD`) with no end date. Throws on a
 * database error so the caller can fail the whole action.
 */
export async function ensureTeamSeason(
  db: SupabaseClient,
  teamId: string,
  seasonName: string,
  fallbackStart: string,
): Promise<string> {
  const { data: existing, error: lookupError } = await db
    .from('seasons')
    .select('id')
    .eq('team_id', teamId)
    .eq('name', seasonName)
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (existing?.id) return existing.id as string;

  const match = SEASON_NAME.exec(seasonName);
  const dates =
    match && isSeasonTerm(match[1])
      ? seasonFor(match[1], Number(match[2]))
      : { startDate: fallbackStart, endDate: null };

  const { data: created, error: insertError } = await db
    .from('seasons')
    .insert({
      team_id: teamId,
      name: seasonName,
      start_date: dates.startDate,
      end_date: dates.endDate,
      is_active: false,
    })
    .select('id')
    .single();
  if (insertError || !created) throw insertError ?? new Error('Season insert returned no row.');
  return created.id as string;
}
