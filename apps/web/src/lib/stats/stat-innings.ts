import type { SupabaseClient } from '@supabase/supabase-js';
import { getLeagueForTeam } from '@baseball/database';
import { DEFAULT_STAT_INNINGS, getStatInnings, mergeWithDefaults } from '@baseball/shared';

/**
 * Innings per game a league's rate stats (ERA, K/N, BB/N) are normalized to:
 * its `gameLength.statInnings` (9 for adult leagues), 7 when unset. Throws
 * with the league id when the read fails, since stats computed on the wrong
 * base would look right and be wrong.
 */
export async function loadLeagueStatInnings(db: SupabaseClient, leagueId: string): Promise<number> {
  const { data, error } = await db.from('leagues').select('scoring_settings').eq('id', leagueId).maybeSingle();
  if (error) throw new Error(`stat innings read failed (league=${leagueId}): ${error.message}`);
  return statInningsFromSettings((data as { scoring_settings: unknown } | null)?.scoring_settings);
}

/** The stat innings in a raw `leagues.scoring_settings` value (null / legacy → 7). */
export function statInningsFromSettings(rawSettings: unknown): number {
  return getStatInnings(mergeWithDefaults(rawSettings ?? {}));
}

/**
 * A team's stat innings: its active league's, else 7 (a team in no league
 * keeps the high-school default).
 */
export async function loadTeamStatInnings(db: SupabaseClient, teamId: string): Promise<number> {
  const league = await getLeagueForTeam(db as never, teamId);
  if (!league) return DEFAULT_STAT_INNINGS;
  return loadLeagueStatInnings(db, league.id);
}
