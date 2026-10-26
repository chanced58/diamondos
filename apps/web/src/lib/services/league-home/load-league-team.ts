import type { SupabaseClient } from '@supabase/supabase-js';
import { leagueTeamInputSchema, type LeagueTeamPlayerTable, type LeagueTeamResponse } from '@baseball/shared';
import {
  TEAM_BATTING_KEYS,
  TEAM_PITCHING_KEYS,
  getTeamStatPageData,
  type TeamPlayerStatRow,
} from '@/lib/league-home/team-load';
import { cellDisplay, cellValue, toStatColumns, type SortColumnSpec } from '@/lib/league-home/team-table-sort';
import { invalidInput, serviceError, serviceOk, type ServiceResult } from '../result';

/**
 * A team's league stat page (the web /l/:slug/team/:teamId page) for the
 * mobile app: the web page's loader, `getTeamStatPageData`, as a signed-in
 * viewer sees it, with the batting and pitching tables' cells formatted and
 * their sort values alongside.
 */

const BATTING_COLUMNS = toStatColumns(
  { key: 'pa', label: 'PA', source: 'pa', field: '', format: 'int', sortDir: 'desc' },
  TEAM_BATTING_KEYS,
);
const PITCHING_COLUMNS = toStatColumns(
  { key: 'ip', label: 'IP', source: 'ip', field: '', format: 'ip', sortDir: 'desc' },
  TEAM_PITCHING_KEYS,
);

/** The team's page in its league for a signed-in viewer. */
export async function loadLeagueTeam(
  _db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<LeagueTeamResponse>> {
  const parsed = leagueTeamInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { slug, teamId, season } = parsed.data;

  try {
    const data = await getTeamStatPageData(slug, teamId, true, season);
    if ('notFound' in data || 'blocked' in data) return serviceError('not_found', 'Team not found.');

    return serviceOk({
      slug,
      league: data.league,
      season: data.season,
      team: data.team,
      record: data.record,
      rank: data.rank,
      divisionName: data.divisionName,
      teamStats: data.teamStats,
      batting: toTable(data.players, BATTING_COLUMNS),
      pitching: toTable(data.players.filter((p) => p.pitched), PITCHING_COLUMNS),
    });
  } catch (error) {
    console.error(`[loadLeagueTeam] slug=${slug} team=${teamId} actor=${actorUserId} failed:`, error);
    return serviceError('failed', 'Something went wrong. Please try again.');
  }
}

/** A player table on the wire: each cell's sort value (null when hidden) and its text. */
function toTable(players: TeamPlayerStatRow[], columns: SortColumnSpec[]): LeagueTeamPlayerTable {
  return {
    columns: columns.map((c) => ({ key: c.key, label: c.label, sortDir: c.sortDir })),
    rows: players.map((p) => ({
      playerId: p.playerId,
      name: p.name,
      optedOut: p.optedOut,
      cells: Object.fromEntries(
        columns.map((c) => [c.key, { value: p.optedOut ? null : cellValue(p, c), display: cellDisplay(p, c) }]),
      ),
    })),
  };
}
