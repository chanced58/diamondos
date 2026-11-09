import { getStatDef, rankLeaderRows, type LeaderRow, type StatDef, type StatKey } from '@baseball/shared';
import { getStatValue } from '../league-home/stat-value';
import type { SortColumnSpec } from '../league-home/team-table-sort';

export interface StatsPlayer {
  playerId: string;
  name: string;
  teamId: string;
  teamName: string;
  pa: number;
  ipOuts: number;
  stats: unknown;
  mine: boolean;
  ourTeam: boolean;
}

/** `null` rank = not eligible / not qualified for that column. */
export interface RankCell {
  league: number | null;
  leagueOf: number;
  team: number | null;
  teamOf: number;
}

/** column key -> playerId -> cell */
export type RankTable = Record<string, Record<string, RankCell>>;

type RankStat = Pick<StatDef, 'sortDir' | 'isRate' | 'qualifier'>;

const LEAD_STAT: RankStat = { sortDir: 'desc', isRate: false, qualifier: 'none' };

function columnValue(p: StatsPlayer, col: SortColumnSpec): number {
  if (col.source === 'pa') return p.pa;
  if (col.source === 'ip') return p.ipOuts;
  return getStatValue(p.stats, col.field);
}

/**
 * Rank every player in every column, league-wide and within their own team.
 * Every player gets a cell for every column; ineligible ones have null ranks.
 */
export function computeRankTable(
  players: StatsPlayer[],
  columns: SortColumnSpec[],
  group: 'batting' | 'pitching',
  mins: { paMin: number; ipOutsMin: number },
): RankTable {
  const min = group === 'batting' ? mins.paMin : mins.ipOutsMin;
  const activityOf = (p: StatsPlayer) => (group === 'batting' ? p.pa : p.ipOuts);

  const byTeam = new Map<string, StatsPlayer[]>();
  for (const p of players) {
    const list = byTeam.get(p.teamId);
    if (list) list.push(p);
    else byTeam.set(p.teamId, [p]);
  }

  const table: RankTable = {};
  for (const col of columns) {
    const stat: RankStat = col.source === 'stat' ? getStatDef(col.key as StatKey) : LEAD_STAT;
    const toRow = (p: StatsPlayer): LeaderRow => ({
      id: p.playerId,
      name: p.name,
      teamId: p.teamId,
      value: columnValue(p, col),
      qualifierValue: activityOf(p),
      activity: activityOf(p),
    });
    const rankMap = (ps: StatsPlayer[]) => {
      const ranked = rankLeaderRows(ps.map(toRow), stat, min);
      return { ranks: new Map(ranked.map((r) => [r.id, r.rank])), count: ranked.length };
    };

    const league = rankMap(players);
    const teamRanks = new Map<string, ReturnType<typeof rankMap>>();
    for (const [teamId, ps] of byTeam) teamRanks.set(teamId, rankMap(ps));

    const cells: Record<string, RankCell> = {};
    for (const p of players) {
      const team = teamRanks.get(p.teamId)!;
      cells[p.playerId] = {
        league: league.ranks.get(p.playerId) ?? null,
        leagueOf: league.count,
        team: team.ranks.get(p.playerId) ?? null,
        teamOf: team.count,
      };
    }
    table[col.key] = cells;
  }
  return table;
}
