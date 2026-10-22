import type { SupabaseClient } from '@supabase/supabase-js';
import { getLeagueForTeam } from '@baseball/database';
import {
  leagueStatsInputSchema,
  type LeagueComparisonResponse,
  type LeagueStatsResponse,
} from '@baseball/shared';
import { loadLeaguePlayerStats } from '@/lib/stats/league-stats';
import { loadTeamComparison } from '@/lib/stats/team-comparison';
import { invalidInput, serviceError, serviceOk, type ServiceResult } from '../result';
import { resolveGameViewer } from '../games/authorize';
import { toBattingRow, toPitchingRow } from '../stats/wire';

/**
 * The league pages for the mobile Stats tab — League Stats and Team
 * Comparison — from the web pages' loaders, for the same people: members of
 * a team in a league (and platform admins), about the team's league.
 */

type League = { id: string; name: string };

export function loadLeagueStats(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<LeagueStatsResponse>> {
  return withTeamLeague(db, actorUserId, rawInput, 'loadLeagueStats', async (teamId, league) => {
    const stats = await loadLeaguePlayerStats(db, league.id);
    return {
      teamId,
      league,
      teamCount: stats.teamCount,
      gameCount: stats.gameCount,
      pitching: stats.pitching.map(toPitchingRow),
      batting: stats.batting.map(toBattingRow),
    };
  });
}

export function loadLeagueComparison(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<LeagueComparisonResponse>> {
  return withTeamLeague(db, actorUserId, rawInput, 'loadLeagueComparison', async (teamId, league) => ({
    teamId,
    league,
    rows: await loadTeamComparison(db, league.id),
  }));
}

/**
 * Validates the team, admits its members, finds its league and runs `load`;
 * any failed read becomes a logged `failed` rather than a partial league.
 */
async function withTeamLeague<T>(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
  service: string,
  load: (teamId: string, league: League) => Promise<T>,
): Promise<ServiceResult<T>> {
  const parsed = leagueStatsInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { teamId } = parsed.data;

  const viewer = await resolveGameViewer(db, actorUserId, teamId);
  if (!viewer) return serviceError('not_found', 'Team not found.');

  try {
    const league = await getLeagueForTeam(db as never, teamId);
    if (!league) return serviceError('not_found', 'This team is not in a league.');
    return serviceOk(await load(teamId, { id: league.id, name: league.name }));
  } catch (err) {
    console.error(`[${service}] team=${teamId} actor=${actorUserId} failed:`, err);
    return serviceError('failed', 'Failed to load league stats.');
  }
}
