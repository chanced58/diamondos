import { getStatDef, type StatKey } from '@baseball/shared';
import { getStatValue } from '../league-home/stat-value';
import { formatStat } from '../league-home/format-stat';
import type { SortColumnSpec } from '../league-home/team-table-sort';
import { BATTING_COLUMNS, PITCHING_COLUMNS, CARD_KEYS, DEFAULT_SORT } from './columns';
import type { RankCell, RankTable, StatsPlayer } from './ranks';

type Tab = 'batting' | 'pitching';

/** Fixed-locale collation so server (SSR) and browser order names identically. */
const collator = new Intl.Collator('en');

export interface ViewState {
  teamId: string | 'all';
  query: string;
  qualifiedOnly: boolean;
  sortKey: string;
  sortDir: 'asc' | 'desc';
}

export interface CardItem {
  label: string;
  display: string;
  rank: RankCell | null;
  needs: string | null;
}

const columnsFor = (tab: Tab): SortColumnSpec[] => (tab === 'batting' ? BATTING_COLUMNS : PITCHING_COLUMNS);

function valueOf(p: StatsPlayer, col: SortColumnSpec): number {
  if (col.source === 'pa') return p.pa;
  if (col.source === 'ip') return p.ipOuts;
  return getStatValue(p.stats, col.field);
}

/** Catalog rate stat that needs a qualifying minimum ('pa', 'ip', 'name' never do). */
function isQualifiedRate(col: SortColumnSpec): boolean {
  if (col.source !== 'stat') return false;
  const def = getStatDef(col.key as StatKey);
  return def.isRate && def.qualifier !== 'none';
}

export function visiblePlayers(
  players: StatsPlayer[],
  tab: Tab,
  state: ViewState,
  ranks: RankTable | null,
  selectedPlayerId: string | null,
): StatsPlayer[] {
  const q = state.query.trim().toLowerCase();
  const col = columnsFor(tab).find((c) => c.key === state.sortKey);
  const rankMap = ranks && col ? ranks[col.key] : undefined;
  const isRanked = (p: StatsPlayer) => rankMap?.[p.playerId]?.league != null;
  // Sorted by name, the rank columns show the tab's default stat, so "Qualified
  // only" filters by that stat's qualifier rather than switching off.
  const qualCol =
    state.sortKey === 'name' ? columnsFor(tab).find((c) => c.key === DEFAULT_SORT[tab].sortKey) : col;
  const qualMap = ranks && qualCol ? ranks[qualCol.key] : undefined;
  const applyQualified = state.qualifiedOnly && ranks !== null && q === '' && !!qualCol && isQualifiedRate(qualCol);

  const rows = players.filter((p) => {
    if (tab === 'batting' ? p.pa <= 0 : p.ipOuts <= 0) return false;
    if (state.teamId !== 'all' && p.teamId !== state.teamId) return false;
    if (q && !p.name.toLowerCase().includes(q)) return false;
    const qualified = qualMap?.[p.playerId]?.league != null;
    if (applyQualified && !qualified && !p.mine && p.playerId !== selectedPlayerId) return false;
    return true;
  });

  const dirMul = state.sortDir === 'asc' ? 1 : -1;
  const byName = (a: StatsPlayer, b: StatsPlayer) => collator.compare(a.name, b.name);

  if (state.sortKey === 'name') return rows.sort((a, b) => byName(a, b) * dirMul);
  if (!col) return rows.sort(byName);

  const byValue = (a: StatsPlayer, b: StatsPlayer) => (valueOf(a, col) - valueOf(b, col)) * dirMul || byName(a, b);
  if (!ranks) return rows.sort(byValue);
  const ranked = rows.filter(isRanked).sort(byValue);
  const unranked = rows.filter((p) => !isRanked(p)).sort(byName);
  return [...ranked, ...unranked];
}

export function cardItems(
  player: StatsPlayer,
  tab: Tab,
  ranks: RankTable | null,
  mins: { paMin: number; ipOutsMin: number },
): CardItem[] {
  const cols = columnsFor(tab);
  const items: CardItem[] = [];
  for (const key of CARD_KEYS[tab]) {
    const col = cols.find((c) => c.key === key);
    if (!col) continue;
    const rank = ranks ? (ranks[key]?.[player.playerId] ?? null) : null;

    let needs: string | null = null;
    if (ranks && isQualifiedRate(col) && rank?.league == null) {
      if (tab === 'batting') {
        const n = Math.ceil(mins.paMin - player.pa);
        if (player.pa > 0 && n > 0) needs = `Needs ${n} more PA`;
      } else {
        const outs = Math.ceil(mins.ipOutsMin - player.ipOuts);
        if (player.ipOuts > 0 && outs > 0) needs = `Needs ${formatStat(outs, 'ip')} more IP`;
      }
    }
    items.push({ label: col.label, display: formatStat(valueOf(player, col), col.format), rank, needs });
  }
  return items;
}
