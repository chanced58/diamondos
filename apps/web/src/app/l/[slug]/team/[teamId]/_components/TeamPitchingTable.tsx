import { getStatDef } from '@baseball/shared';
import { TEAM_PITCHING_KEYS, type TeamPlayerStatRow } from '@/lib/league-home/team-load';
import type { SortColumnSpec } from '@/lib/league-home/team-table-sort';
import { SortablePlayerTable } from './SortablePlayerTable';

export function TeamPitchingTable({ players }: { players: TeamPlayerStatRow[] }): JSX.Element | null {
  const pitchers = players.filter((p) => p.pitched);
  if (pitchers.length === 0) return null;
  const columns: SortColumnSpec[] = [
    { key: 'ip', label: 'IP', source: 'ip', field: '', format: 'ip', sortDir: 'desc' },
    ...TEAM_PITCHING_KEYS.map((k) => {
      const d = getStatDef(k);
      return { key: d.key, label: d.label, source: 'stat' as const, field: d.field, format: d.format, sortDir: d.sortDir };
    }),
  ];
  return <SortablePlayerTable nameHeader="Pitcher" rows={pitchers} columns={columns} defaultSortKey="ip" />;
}
