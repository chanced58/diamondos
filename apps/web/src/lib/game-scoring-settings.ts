import type { SupabaseClient } from '@supabase/supabase-js';
import {
  mergeWithDefaults,
  type LeagueScoringSettings,
} from '@baseball/shared';
import { getLeagueSettingsForTeam } from './league-settings';

export interface GameScoringSettingsContext {
  teamId: string;
  tournamentId?: string | null;
  scoringSettingsSnapshot?: unknown | null;
}

/** Resolve rules for a specific game, keeping tournament settings isolated by instance. */
export async function getScoringSettingsForGame(
  db: SupabaseClient,
  game: GameScoringSettingsContext,
): Promise<LeagueScoringSettings> {
  if (!game.tournamentId) {
    return getLeagueSettingsForTeam(db, game.teamId);
  }

  if (game.scoringSettingsSnapshot) {
    return mergeWithDefaults(game.scoringSettingsSnapshot);
  }

  const { data, error } = await db
    .from('tournaments')
    .select('scoring_settings')
    .eq('id', game.tournamentId)
    .maybeSingle();

  if (error || !data?.scoring_settings) {
    console.error(
      `[game-scoring-settings] tournament settings lookup failed game tournament=${game.tournamentId}: ${error?.message ?? 'tournament not found'}`,
    );
    throw new Error('Unable to load tournament scoring settings. Try again before editing the lineup or scoring this game.');
  }

  return mergeWithDefaults(data.scoring_settings);
}
