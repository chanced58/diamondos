import type { StatsTab } from '@/lib/league-stats/columns';
import type { MyPlayer, StatsTeam } from '@/lib/league-stats/load';
import type { RankTable, StatsPlayer } from '@/lib/league-stats/ranks';
import { cardItems, type CardItem } from '@/lib/league-stats/view';

/** Row id the card scrolls to: the player's row, or their team's row on the Teams tab. */
export const playerRowId = (playerId: string): string => `row-${playerId}`;
export const teamRowId = (teamId: string): string => `row-team-${teamId}`;

export function YourRanksCard({
  myPlayers,
  players,
  tab,
  ranks,
  mins,
  selectedId,
  onSelect,
  onShowInTable,
  teams,
  rankingEnabled,
}: {
  myPlayers: MyPlayer[];
  players: StatsPlayer[];
  tab: StatsTab;
  ranks: { batting: RankTable; pitching: RankTable } | null;
  mins: { paMin: number; ipOutsMin: number };
  selectedId: string | null;
  onSelect: (playerId: string) => void;
  /** Reveal and scroll to a table row (the parent clears filters that hide it). */
  onShowInTable: (rowId: string) => void;
  teams: StatsTeam[];
  rankingEnabled: boolean;
}): JSX.Element | null {
  const player = players.find((p) => p.playerId === selectedId);
  if (myPlayers.length === 0 || !player) return null;

  const team = teams.find((t) => t.teamId === player.teamId);
  // The player tables list only players with a line on that tab (PA > 0 / IP > 0).
  const hasLine = tab === 'teams' || (tab === 'batting' ? player.pa : player.ipOuts) > 0;
  const targetId =
    tab === 'teams' ? (team ? teamRowId(team.teamId) : null) : hasLine ? playerRowId(player.playerId) : null;

  return (
    <section
      aria-labelledby="your-ranks-title"
      className="rounded-xl border border-app-border bg-app-surface p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 id="your-ranks-title" className="text-xs font-semibold uppercase tracking-wide text-app-fg-muted">
            {rankingEnabled ? 'Your ranks' : 'Your stats'}
          </h2>
          <p className="mt-0.5 truncate font-semibold text-app-fg">
            {player.name}
            <span className="font-normal text-app-fg-subtle"> · {player.teamName}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {myPlayers.length > 1 ? (
            <select
              aria-label="Player"
              value={player.playerId}
              onChange={(e) => onSelect(e.target.value)}
              className="rounded-lg border border-app-border bg-app-surface-2 px-2 py-1 text-sm text-app-fg"
            >
              {myPlayers.map((p) => (
                <option key={p.playerId} value={p.playerId}>
                  {p.name}
                </option>
              ))}
            </select>
          ) : null}
          {targetId ? (
            <button
              type="button"
              onClick={() => onShowInTable(targetId)}
              className="rounded-lg px-2 py-1 text-xs font-semibold text-app-fg-muted transition-colors hover:bg-app-surface-2 hover:text-app-fg"
            >
              Show in table ↓
            </button>
          ) : null}
        </div>
      </div>

      {tab === 'teams' ? (
        <TeamLine team={team} teamCount={teams.length} />
      ) : !hasLine ? (
        <p className="mt-3 text-sm text-app-fg-subtle">
          {tab === 'batting' ? 'No plate appearances this season.' : 'No innings pitched this season.'}
        </p>
      ) : (
        <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {cardItems(player, tab, ranks ? ranks[tab] : null, mins).map((item) => (
            <StatTile key={item.label} item={item} teamName={player.teamName} />
          ))}
        </ul>
      )}
    </section>
  );
}

function StatTile({ item, teamName }: { item: CardItem; teamName: string }): JSX.Element {
  const { rank } = item;
  return (
    <li className="rounded-lg bg-app-surface-2 px-3 py-2">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-app-fg-muted">{item.label}</div>
      <div className="mono text-lg font-bold text-app-fg">{item.display}</div>
      {rank?.league != null ? (
        <div className="text-xs text-app-fg-muted">
          #{rank.league} of {rank.leagueOf}
          {rank.team != null ? (
            <span className="block text-app-fg-subtle">
              #{rank.team} on {teamName}
            </span>
          ) : null}
        </div>
      ) : item.needs ? (
        <div className="text-xs text-app-fg-subtle">{item.needs}</div>
      ) : null}
    </li>
  );
}

function TeamLine({ team, teamCount }: { team: StatsTeam | undefined; teamCount: number }): JSX.Element {
  if (!team) return <p className="mt-3 text-sm text-app-fg-subtle">No team record this season.</p>;
  return (
    <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
      <span className="font-semibold text-app-fg">{team.name}</span>
      <span className="mono text-lg font-bold text-app-fg">
        {team.wins}-{team.losses}-{team.ties}
      </span>
      {team.rank != null ? (
        <span className="text-sm text-app-fg-muted">
          #{team.rank} of {teamCount}
        </span>
      ) : null}
    </div>
  );
}
