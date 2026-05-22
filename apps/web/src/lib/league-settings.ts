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
 * platform defaults — that way every consumer can rely on a fully-shaped
 * settings object.
 */
export async function getLeagueSettingsForTeam(
  // Service-role / browser client; we only need a SELECT here
  db: SupabaseClient,
  teamId: string,
): Promise<LeagueScoringSettings> {
  if (!teamId) return defaultLeagueScoringSettings();

  const { data: membership } = await db
    .from('league_members')
    .select('league_id')
    .eq('team_id', teamId)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  if (!membership?.league_id) return defaultLeagueScoringSettings();

  const { data: leagueRow } = await db
    .from('leagues')
    .select('scoring_settings')
    .eq('id', membership.league_id)
    .maybeSingle();

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

  const { data: game } = await db
    .from('games')
    .select('team_id')
    .eq('id', gameId)
    .maybeSingle();

  if (!game?.team_id) return defaultLeagueScoringSettings();
  return getLeagueSettingsForTeam(db, game.team_id);
}
