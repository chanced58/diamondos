import { TEAM_BATTING_KEYS, type TeamPlayerStatRow } from '@/lib/league-home/team-load';
import { toStatColumns } from '@/lib/league-home/team-table-sort';
import { SortablePlayerTable } from './SortablePlayerTable';

export function TeamBattingTable({ players }: { players: TeamPlayerStatRow[] }): JSX.Element {
  if (players.length === 0) {
    return <p className="text-sm text-app-fg-subtle">No players yet for this season.</p>;
  }
  const columns = toStatColumns(
    { key: 'pa', label: 'PA', source: 'pa', field: '', format: 'int', sortDir: 'desc' },
    TEAM_BATTING_KEYS,
  );
  return <SortablePlayerTable nameHeader="Player" rows={players} columns={columns} defaultSortKey="pa" />;
}
