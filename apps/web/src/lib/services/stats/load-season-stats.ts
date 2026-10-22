import type { SupabaseClient } from '@supabase/supabase-js';
import { getLeagueForTeam } from '@baseball/database';
import {
  Feature,
  hasFeature,
  seasonStatsInputSchema,
  type OpponentBattingRow,
  type SeasonStatsResponse,
} from '@baseball/shared';
import { loadTeamSeasonStats } from '@/lib/stats/load-season-stats';
import { resolveTeamTier } from '@/lib/team-tier';
import { invalidInput, serviceError, serviceOk, type ServiceResult } from '../result';
import { resolveGameViewer } from '../games/authorize';
import { finiteOrNull, toBattingRow, toPitchingRow } from './wire';

/**
 * A team's season stats for the mobile Stats tab: the web Stats page's data
 * (one shared loader), visible to the same people — active team members and
 * platform admins. Opponent stats come only on plans with opponent tracking.
 */
export async function loadSeasonStats(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<SeasonStatsResponse>> {
  const parsed = seasonStatsInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { teamId, seasonId } = parsed.data;

  const viewer = await resolveGameViewer(db, actorUserId, teamId);
  if (!viewer) return serviceError('not_found', 'Team not found.');

  try {
    const [subscriptionTier, league] = await Promise.all([
      resolveTeamTier(db, teamId),
      getLeagueForTeam(db as never, teamId),
    ]);
    const features = {
      advancedBatting: hasFeature(subscriptionTier, Feature.ADVANCED_BATTING_STATS),
      advancedPitching: hasFeature(subscriptionTier, Feature.ADVANCED_PITCHING_STATS),
      opponents: hasFeature(subscriptionTier, Feature.OPPONENT_TRACKING),
    };

    const stats = await loadTeamSeasonStats(db, teamId, {
      seasonId,
      includeCatcher: true,
      includeOpponents: features.opponents,
    });

    return serviceOk({
      teamId,
      seasons: stats.seasons,
      season: stats.season,
      gameCount: stats.gameCount,
      defaultTier: stats.defaultTier,
      features,
      hasLeague: league != null,
      pitching: stats.pitching.map((s) => ({
        ...toPitchingRow(s),
        compliance: stats.complianceMap[s.playerId] ?? null,
      })),
      batting: stats.batting.map(toBattingRow),
      catcher: stats.catcher,
      opponents: features.opponents
        ? stats.opponents.map((team) => ({
            ...team,
            batting: team.batting.map((s) => finiteOrNull<OpponentBattingRow>(s)),
            pitching: team.pitching.map(toPitchingRow),
          }))
        : null,
      missingWaiverCount: stats.missingWaiverCount,
    });
  } catch (err) {
    console.error(`[loadSeasonStats] team=${teamId} season=${seasonId ?? 'default'} actor=${actorUserId} failed:`, err);
    return serviceError('failed', 'Failed to load season stats.');
  }
}
