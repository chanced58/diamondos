import { mergeWithDefaults } from '../validation/league-scoring-settings';
import type { LeagueScoringSettings } from '../types/league-scoring-settings';

export const TOURNAMENT_SCORING_RULES_VERSION = 1;

export interface TournamentGameSettingsCache {
  tournamentId: string | null | undefined;
  rulesVersion: number | null | undefined;
  scoringSettings: unknown;
}

/** Resolve a downloaded tournament rules blob or fail closed on stale/incomplete cache data. */
export function resolveTournamentGameSettingsCache(
  cache: TournamentGameSettingsCache,
): LeagueScoringSettings {
  if (!cache.tournamentId) {
    throw new Error('This cached game is not registered to a tournament.');
  }
  if (cache.rulesVersion !== TOURNAMENT_SCORING_RULES_VERSION) {
    throw new Error(
      'Tournament rules are missing or use an unsupported version. Reconnect and sync this game before scoring.',
    );
  }

  const raw = cache.scoringSettings;
  const lineup =
    raw && typeof raw === 'object'
      ? (raw as { lineup?: Record<string, unknown> }).lineup
      : undefined;
  if (
    !lineup ||
    typeof lineup.allowExpanded !== 'boolean' ||
    typeof lineup.maxBatters !== 'number' ||
    !Number.isInteger(lineup.maxBatters) ||
    typeof lineup.allowMidGameExtension !== 'boolean' ||
    typeof lineup.allowMidGameContraction !== 'boolean' ||
    (lineup.allowExpanded && (lineup.maxBatters < 10 || lineup.maxBatters > 30)) ||
    (!lineup.allowExpanded && lineup.maxBatters !== 9)
  ) {
    throw new Error(
      'Tournament batting rules are incomplete. Reconnect and sync this game before scoring.',
    );
  }

  return mergeWithDefaults(raw);
}
