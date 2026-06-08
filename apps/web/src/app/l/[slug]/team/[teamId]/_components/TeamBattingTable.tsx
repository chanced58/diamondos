import { getStatDef } from '@baseball/shared';
import { TEAM_BATTING_KEYS, type TeamPlayerStatRow } from '@/lib/league-home/team-load';
import type { SortColumnSpec } from '@/lib/league-home/team-table-sort';
import { SortablePlayerTable } from './SortablePlayerTable';

export function TeamBattingTable({ players }: { players: TeamPlayerStatRow[] }): JSX.Element {
  if (players.length === 0) {
    return <p className="text-sm text-app-fg-subtle">No players yet for this season.</p>;
  }
  const columns: SortColumnSpec[] = [
    { key: 'pa', label: 'PA', source: 'pa', field: '', format: 'int', sortDir: 'desc' },
    ...TEAM_BATTING_KEYS.map((k) => {
      const d = getStatDef(k);
      return { key: d.key, label: d.label, source: 'stat' as const, field: d.field, format: d.format, sortDir: d.sortDir };
    }),
  ];
  return <SortablePlayerTable nameHeader="Player" rows={players} columns={columns} defaultSortKey="pa" />;
}
