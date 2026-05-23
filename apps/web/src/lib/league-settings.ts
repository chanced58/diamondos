import type { SupabaseClient } from '@supabase/supabase-js';
import {
  defaultLeagueScoringSettings,
  mergeWithDefaults,
  type LeagueScoringSettings,
} from '@baseball/shared';

/**
 * Resolve the LeagueScoringSettings that govern scoring behavior for a team.
 *
 * Multi-league teams are not modeled in v1, so we return the first active
 * league membership we find. If the team is not in any league we return
 * platform defaults.
 *
 * Errors are logged with the offending teamId and the call falls back to
 * platform defaults rather than throwing — the scoring UI can still render
 * (with default gates) and operators can investigate via logs. Throwing
 * here would hard-fail every scoring-related page on a transient DB blip.
 */
export async function getLeagueSettingsForTeam(
  // Service-role / browser client; we only need a SELECT here
  db: SupabaseClient,
  teamId: string,
): Promise<LeagueScoringSettings> {
  if (!teamId) return defaultLeagueScoringSettings();

  const { data: membership, error: membershipErr } = await db
    .from('league_members')
    .select('league_id')
    .eq('team_id', teamId)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  if (membershipErr) {
    console.error(
      `[league-settings] league_members lookup failed team=${teamId}: ${membershipErr.message}`,
    );
    return defaultLeagueScoringSettings();
  }
  if (!membership?.league_id) return defaultLeagueScoringSettings();

  const { data: leagueRow, error: leagueErr } = await db
    .from('leagues')
    .select('scoring_settings')
    .eq('id', membership.league_id)
    .maybeSingle();

  if (leagueErr) {
    console.error(
      `[league-settings] leagues.scoring_settings lookup failed team=${teamId} league=${membership.league_id}: ${leagueErr.message}`,
    );
    return defaultLeagueScoringSettings();
  }

  return mergeWithDefaults(leagueRow?.scoring_settings ?? {});
}

/**
 * Same as above but starting from a game. Resolves the home team first.
 */
export async function getLeagueSettingsForGame(
  db: SupabaseClient,
  gameId: string,
): Promise<LeagueScoringSettings> {
  if (!gameId) return defaultLeagueScoringSettings();

  const { data: game, error: gameErr } = await db
    .from('games')
    .select('team_id')
    .eq('id', gameId)
    .maybeSingle();

  if (gameErr) {
    console.error(
      `[league-settings] games lookup failed game=${gameId}: ${gameErr.message}`,
    );
    return defaultLeagueScoringSettings();
  }
  if (!game?.team_id) return defaultLeagueScoringSettings();
  return getLeagueSettingsForTeam(db, game.team_id);
}
