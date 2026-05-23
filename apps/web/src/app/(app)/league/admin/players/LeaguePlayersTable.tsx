'use client';

import type { JSX } from 'react';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { LeaguePlayerRow } from '@baseball/database';
import { AddLeaguePlayerDialog } from './AddLeaguePlayerDialog';
import { TradePlayerDialog } from './TradePlayerDialog';
import { ReleasePlayerDialog } from './ReleasePlayerDialog';

type Team = { id: string; name: string; divisionId: string | null };
type Division = { id: string; name: string };

type Props = {
  leagueId: string;
  players: LeaguePlayerRow[];
  teams: Team[];
  divisions: Division[];
  canEdit: boolean;
};

type Filter = {
  search: string;
  teamId: string;   // '' = all, 'free' = free agents
  divisionId: string;
};

export function LeaguePlayersTable({
  leagueId, players, teams, divisions, canEdit,
}: Props): JSX.Element {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>({ search: '', teamId: '', divisionId: '' });
  const [adding, setAdding] = useState(false);
  const [tradeTarget, setTradeTarget] = useState<LeaguePlayerRow | null>(null);
  const [releaseTarget, setReleaseTarget] = useState<LeaguePlayerRow | null>(null);

  const filtered = useMemo(() => {
    const s = filter.search.trim().toLowerCase();
    return players.filter((p) => {
      if (filter.teamId === 'free' && p.player.team_id !== null) return false;
      if (filter.teamId && filter.teamId !== 'free' && p.player.team_id !== filter.teamId) return false;
      if (filter.divisionId) {
        const team = teams.find((t) => t.id === p.player.team_id);
        if (team?.divisionId !== filter.divisionId) return false;
      }
      if (s) {
        const blob = `${p.player.first_name} ${p.player.last_name} #${p.player.jersey_number ?? ''}`.toLowerCase();
        if (!blob.includes(s)) return false;
      }
      return true;
    });
  }, [players, teams, filter]);

  const freeAgents = players.filter((p) => p.player.team_id === null);

  function onAfterMutation() {
    setAdding(false);
    setTradeTarget(null);
    setReleaseTarget(null);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2">
        {canEdit && (
          <button
            onClick={() => setAdding(true)}
            className="text-sm font-medium bg-brand-700 text-white px-4 py-2 rounded-lg hover:bg-brand-800"
          >
            + Add Player
          </button>
        )}
      </div>

      <div className="flex gap-2 flex-wrap">
        <input
          type="text"
          value={filter.search}
          onChange={(e) => setFilter({ ...filter, search: e.target.value })}
          placeholder="Search name or jersey…"
          className="flex-1 min-w-[220px] text-sm border border-gray-300 rounded-lg px-3 py-2"
        />
        <select
          value={filter.teamId}
          onChange={(e) => setFilter({ ...filter, teamId: e.target.value })}
          className="text-sm border border-gray-300 rounded-lg px-3 py-2"
        >
          <option value="">All teams</option>
          <option value="free">— Free agents —</option>
          {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <select
          value={filter.divisionId}
          onChange={(e) => setFilter({ ...filter, divisionId: e.target.value })}
          className="text-sm border border-gray-300 rounded-lg px-3 py-2"
        >
          <option value="">All divisions</option>
          {divisions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </div>

      {freeAgents.length > 0 && filter.teamId !== 'free' && (
        <div className="flex justify-between items-center border border-amber-300 bg-amber-50 rounded-lg px-4 py-3">
          <div>
            <div className="text-sm font-semibold text-amber-800">{freeAgents.length} free agents</div>
            <div className="text-xs text-amber-700">Registered in the league but not currently on a team</div>
          </div>
          <button
            onClick={() => setFilter({ ...filter, teamId: 'free' })}
            className="text-xs font-medium text-amber-800 border border-amber-300 rounded-md px-3 py-1.5 hover:bg-amber-100"
          >
            View free agents
          </button>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b border-gray-100">
              <th className="px-4 py-2">Player</th>
              <th className="px-4 py-2">Team</th>
              <th className="px-4 py-2">DOB</th>
              <th className="px-4 py-2">Jersey</th>
              <th className="px-4 py-2">Status</th>
              {canEdit && <th className="px-4 py-2 text-right">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={canEdit ? 6 : 5} className="px-4 py-6 text-center text-gray-400 text-sm">
                  No players match these filters.
                </td>
              </tr>
            ) : filtered.map((p) => {
              const isFree = p.player.team_id === null;
              return (
                <tr key={p.player.id} className={isFree ? 'bg-amber-50/40' : ''}>
                  <td className="px-4 py-3">
                    <Link href={`/league/admin/players/${p.player.id}`} className="font-medium text-gray-900 hover:underline">
                      {p.player.first_name} {p.player.last_name}
                    </Link>
                    {p.player.primary_position && (
                      <div className="text-xs text-gray-500">{formatPosition(p.player.primary_position)}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {p.player.team?.name ?? <span className="text-gray-400">— unassigned —</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {p.player.date_of_birth ?? <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {p.player.jersey_number != null ? `#${p.player.jersey_number}` : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    {isFree ? (
                      <span className="text-xs font-medium text-amber-700 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-full">Free agent</span>
                    ) : (
                      <span className="text-xs font-medium text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">Rostered</span>
                    )}
                  </td>
                  {canEdit && (
                    <td className="px-4 py-3 text-right space-x-2">
                      <button
                        onClick={() => setTradeTarget(p)}
                        className="text-xs font-medium text-gray-700 border border-gray-300 rounded-md px-2 py-1 hover:bg-gray-50"
                      >
                        {isFree ? 'Assign' : 'Trade'}
                      </button>
                      {!isFree && (
                        <button
                          onClick={() => setReleaseTarget(p)}
                          className="text-xs font-medium text-red-700 hover:text-red-900"
                        >
                          Release
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {adding && (
        <AddLeaguePlayerDialog
          leagueId={leagueId}
          teams={teams}
          onClose={() => setAdding(false)}
          onSuccess={onAfterMutation}
        />
      )}
      {tradeTarget && (
        <TradePlayerDialog
          leagueId={leagueId}
          player={tradeTarget}
          teams={teams}
          onClose={() => setTradeTarget(null)}
          onSuccess={onAfterMutation}
        />
      )}
      {releaseTarget && (
        <ReleasePlayerDialog
          leagueId={leagueId}
          player={releaseTarget}
          onClose={() => setReleaseTarget(null)}
          onSuccess={onAfterMutation}
        />
      )}
    </div>
  );
}

function formatPosition(p: string): string {
  return p.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
