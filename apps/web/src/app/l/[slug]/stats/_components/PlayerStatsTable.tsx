import { Fragment } from 'react';
import type { SortColumnSpec } from '@/lib/league-home/team-table-sort';
import { formatStat } from '@/lib/league-home/format-stat';
import { getStatValue } from '@/lib/league-home/stat-value';
import { teamHref } from '@/lib/league-home/team-href';
import type { RankTable, StatsPlayer } from '@/lib/league-stats/ranks';

type SortDir = 'asc' | 'desc';

function cellDisplay(p: StatsPlayer, col: SortColumnSpec): string {
  if (col.source === 'pa') return formatStat(p.pa, 'int');
  if (col.source === 'ip') return formatStat(p.ipOuts, 'ip');
  return formatStat(getStatValue(p.stats, col.field), col.format);
}

/**
 * Row tint. `row` goes on the <tr>; `sticky` is an opaque equivalent for the
 * sticky cells, which must hide the columns scrolling underneath them.
 * The selected player gets the full highlight; the viewer's other linked players
 * and (for coaches) their active team's rows get the lighter tint.
 */
function rowTone(p: StatsPlayer, highlighted: boolean): { row: string; sticky: string } {
  if (highlighted) return { row: 'bg-turf-50', sticky: 'bg-turf-50' };
  if (p.mine || p.ourTeam) {
    // A translucent background-image over the opaque surface color keeps the
    // lighter tint while staying opaque.
    return {
      row: 'bg-turf-50/50',
      sticky: 'bg-app-surface bg-gradient-to-r from-turf-50/50 to-turf-50/50',
    };
  }
  return { row: '', sticky: 'bg-app-surface' };
}

export function PlayerStatsTable({
  players,
  caption,
  columns,
  ranks,
  rankKey,
  sortKey,
  sortDir,
  onSort,
  highlightId,
  slug,
  season,
}: {
  players: StatsPlayer[];
  /** Accessible table name, e.g. "Batting stats". */
  caption: string;
  columns: SortColumnSpec[];
  /** This tab's rank table; null when the league hides rankings. */
  ranks: RankTable | null;
  /** Column whose ranks fill Lg/Tm (the sorted stat, or the tab default when sorted by name). */
  rankKey: string;
  sortKey: string;
  sortDir: SortDir;
  onSort: (key: string, naturalDir: SortDir) => void;
  /** The card's selected player — the only row with the full highlight and ◆ marker. */
  highlightId: string | null;
  slug: string;
  season: string;
}): JSX.Element {
  const showRanks = ranks !== null;
  const rankMap = ranks?.[rankKey];
  // Sticky offsets: Lg (w-10) and Tm (w-10) precede Player when ranks show, so
  // Player sits at their sum (left-20 = 5rem). Kept narrow so stat columns stay
  // visible on a phone.
  const playerLeft = showRanks ? 'left-20' : 'left-0';
  // When sorted by a stat, unranked rows follow the ranked ones in name order
  // (see visiblePlayers); a divider row says so instead of implying the sort.
  const firstUnranked =
    showRanks && sortKey !== 'name' ? players.findIndex((p) => rankMap?.[p.playerId]?.league == null) : -1;
  const colCount = (showRanks ? 2 : 0) + 2 + columns.length;

  const header = (key: string, label: string, natural: SortDir, align: 'left' | 'center', extra = ''): JSX.Element => {
    const active = key === sortKey;
    return (
      <th
        key={key}
        aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
        className={`${align === 'left' ? 'px-3' : 'px-2 text-center'} py-2.5 ${extra}`}
      >
        <button
          type="button"
          onClick={() => onSort(key, natural)}
          className={`inline-flex items-center gap-1 whitespace-nowrap rounded uppercase tracking-wider hover:text-app-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-fg/40 ${
            active ? 'text-app-fg' : ''
          } ${align === 'center' ? 'mx-auto' : ''}`}
        >
          {label}
          <span aria-hidden className="inline-block w-2 text-[9px] leading-none">
            {active ? (sortDir === 'asc' ? '▲' : '▼') : ''}
          </span>
        </button>
      </th>
    );
  };

  return (
    <div className="overflow-x-auto rounded-xl border border-app-border bg-app-surface">
      <table className="w-full text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-app-border text-left text-xs font-medium uppercase tracking-wider text-app-fg-muted">
            {showRanks ? (
              <>
                <th
                  aria-label="League rank"
                  title="League rank"
                  className="sticky left-0 z-10 w-10 min-w-[2.5rem] max-w-[2.5rem] bg-app-surface px-1 py-2.5 text-center"
                >
                  Lg
                </th>
                <th
                  aria-label="Team rank"
                  title="Team rank"
                  className="sticky left-10 z-10 w-10 min-w-[2.5rem] max-w-[2.5rem] bg-app-surface px-1 py-2.5 text-center"
                >
                  Tm
                </th>
              </>
            ) : null}
            {header('name', 'Player', 'asc', 'left', `sticky ${playerLeft} z-10 bg-app-surface`)}
            <th className="px-3 py-2.5">Team</th>
            {columns.map((c) => header(c.key, c.label, c.sortDir, 'center'))}
          </tr>
        </thead>
        <tbody className="divide-y divide-app-border">
          {players.map((p, i) => {
            const highlighted = p.playerId === highlightId;
            const tone = rowTone(p, highlighted);
            const cell = rankMap?.[p.playerId];
            const unranked = showRanks && cell?.league == null;
            return (
              <Fragment key={p.playerId}>
                {i === firstUnranked ? (
                  <tr className="bg-app-surface-2">
                    <th
                      scope="rowgroup"
                      colSpan={colCount}
                      className="px-3 py-1.5 text-left text-xs font-semibold text-app-fg-muted"
                    >
                      Not ranked · listed by name
                    </th>
                  </tr>
                ) : null}
                <tr
                  id={`row-${p.playerId}`}
                  className={`${tone.row} ${unranked ? 'text-app-fg-subtle' : ''}`}
                >
                  {showRanks ? (
                    <>
                      <td className={`mono sticky left-0 z-10 w-10 min-w-[2.5rem] max-w-[2.5rem] px-1 py-2.5 text-center ${tone.sticky}`}>
                        {cell?.league ?? '—'}
                      </td>
                      <td className={`mono sticky left-10 z-10 w-10 min-w-[2.5rem] max-w-[2.5rem] px-1 py-2.5 text-center ${tone.sticky}`}>
                        {cell?.team ?? '—'}
                      </td>
                    </>
                  ) : null}
                  <td
                    className={`sticky ${playerLeft} z-10 whitespace-nowrap px-3 py-2.5 font-medium ${
                      unranked ? '' : 'text-app-fg'
                    } ${tone.sticky}`}
                  >
                    <span title={p.name} className="inline-block max-w-[8rem] truncate align-bottom">
                      {p.name}
                    </span>
                    {highlighted ? (
                      <span
                        aria-label="Your player"
                        title="Your player"
                        className="ml-1 inline-block h-2 w-2 rotate-45 rounded-[1px] bg-turf-600 align-middle"
                      />
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    <a href={teamHref(slug, p.teamId, season)} className="hover:underline">
                      {p.teamName}
                    </a>
                  </td>
                  {columns.map((c) => (
                    <td key={c.key} className="mono px-2 py-2.5 text-center">
                      {cellDisplay(p, c)}
                    </td>
                  ))}
                </tr>
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
