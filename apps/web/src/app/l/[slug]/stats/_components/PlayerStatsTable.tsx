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
 */
function rowTone(p: StatsPlayer, highlighted: boolean): { row: string; sticky: string } {
  if (highlighted) return { row: 'bg-turf-50', sticky: 'bg-turf-50' };
  if (p.ourTeam) {
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
  columns: SortColumnSpec[];
  /** This tab's rank table; null when the league hides rankings. */
  ranks: RankTable | null;
  /** Column whose ranks fill Lg #/Team # (the sorted stat, or the tab default when sorted by name). */
  rankKey: string;
  sortKey: string;
  sortDir: SortDir;
  onSort: (key: string, naturalDir: SortDir) => void;
  /** The card's selected player — highlighted like the viewer's own row. */
  highlightId: string | null;
  slug: string;
  season: string;
}): JSX.Element {
  const showRanks = ranks !== null;
  const rankMap = ranks?.[rankKey];
  // Sticky offsets: Lg # (w-12) and Team # (4.5rem) precede Player when ranks show.
  const playerLeft = showRanks ? 'left-[7.5rem]' : 'left-0';

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
        <thead>
          <tr className="border-b border-app-border text-left text-xs font-medium uppercase tracking-wider text-app-fg-muted">
            {showRanks ? (
              <>
                <th className="sticky left-0 z-10 w-12 min-w-[3rem] bg-app-surface px-2 py-2.5 text-center">Lg #</th>
                <th className="sticky left-12 z-10 w-[4.5rem] min-w-[4.5rem] whitespace-nowrap bg-app-surface px-2 py-2.5 text-center">Team #</th>
              </>
            ) : null}
            {header('name', 'Player', 'asc', 'left', `sticky ${playerLeft} z-10 bg-app-surface`)}
            <th className="px-3 py-2.5">Team</th>
            {columns.map((c) => header(c.key, c.label, c.sortDir, 'center'))}
          </tr>
        </thead>
        <tbody className="divide-y divide-app-border">
          {players.map((p) => {
            const highlighted = p.mine || p.playerId === highlightId;
            const tone = rowTone(p, highlighted);
            const cell = rankMap?.[p.playerId];
            const unranked = showRanks && cell?.league == null;
            return (
              <tr
                key={p.playerId}
                id={`row-${p.playerId}`}
                className={`${tone.row} ${unranked ? 'text-app-fg-subtle' : ''}`}
              >
                {showRanks ? (
                  <>
                    <td className={`mono sticky left-0 z-10 w-12 min-w-[3rem] px-2 py-2.5 text-center ${tone.sticky}`}>
                      {cell?.league ?? '—'}
                    </td>
                    <td className={`mono sticky left-12 z-10 w-[4.5rem] min-w-[4.5rem] whitespace-nowrap px-2 py-2.5 text-center ${tone.sticky}`}>
                      {cell?.team ?? '—'}
                    </td>
                  </>
                ) : null}
                <td
                  className={`sticky ${playerLeft} z-10 whitespace-nowrap px-3 py-2.5 font-medium ${
                    unranked ? '' : 'text-app-fg'
                  } ${tone.sticky}`}
                >
                  {p.name}
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
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
