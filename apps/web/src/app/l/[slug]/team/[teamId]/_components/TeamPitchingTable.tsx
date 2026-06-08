import { TEAM_PITCHING_KEYS, type TeamPlayerStatRow } from '@/lib/league-home/team-load';
import { toStatColumns } from '@/lib/league-home/team-table-sort';
import { SortablePlayerTable } from './SortablePlayerTable';

export function TeamPitchingTable({ players }: { players: TeamPlayerStatRow[] }): JSX.Element | null {
  const pitchers = players.filter((p) => p.pitched);
  if (pitchers.length === 0) return null;
  const columns = toStatColumns(
    { key: 'ip', label: 'IP', source: 'ip', field: '', format: 'ip', sortDir: 'desc' },
    TEAM_PITCHING_KEYS,
  );
  return <SortablePlayerTable nameHeader="Pitcher" rows={pitchers} columns={columns} defaultSortKey="ip" />;
}
