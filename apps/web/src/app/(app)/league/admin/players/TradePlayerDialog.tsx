'use client';

import type { JSX } from 'react';
import { useState } from 'react';
import type { LeaguePlayerRow } from '@baseball/database';
import { transferPlayer } from './actions';

type Team = { id: string; name: string };

type Props = {
  leagueId: string;
  player: LeaguePlayerRow;
  teams: Team[];
  onClose: () => void;
  onSuccess: () => void;
};

export function TradePlayerDialog({ leagueId, player, teams, onClose, onSuccess }: Props): JSX.Element {
  const isAssignment = player.player.team_id === null;
  const [toTeamId, setToTeamId] = useState('');
  const [effective, setEffective] = useState('');
  const [reason, setReason] = useState('');
  const [collision, setCollision] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const eligibleTeams = teams.filter((t) => t.id !== player.player.team_id);
  const fullName = `${player.player.first_name} ${player.player.last_name}`;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    const res = await transferPlayer({
      leagueId,
      playerId: player.player.id,
      toTeamId,
      effectiveAt: effective ? new Date(effective).toISOString() : undefined,
      reason: reason || undefined,
      acceptJerseyClear: !!collision,
    });
    setSaving(false);
    if (!res.ok) {
      if (res.code === 'JERSEY_CONFLICT') {
        setCollision((res.meta?.conflictingPlayerName as string) ?? 'another player');
        return;
      }
      if (res.code === 'IN_PROGRESS_GAME') {
        setErr(`Cannot trade — ${fullName} is in a live game. Finalize the game first.`);
        return;
      }
      setErr(res.message);
      return;
    }
    onSuccess();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <form onSubmit={submit} className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
        <h2 className="text-lg font-semibold">
          {isAssignment ? `Assign ${fullName}` : `Trade ${fullName}`}
        </h2>
        {!isAssignment && (
          <p className="text-xs text-gray-500">
            Currently on: {player.player.team?.name ?? 'unknown'}
          </p>
        )}

        {err && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-3 py-2">
            {err}
          </div>
        )}

        <label className="text-xs font-medium text-gray-600 flex flex-col gap-1">
          {isAssignment ? 'Assign to team' : 'Move to team'}
          <select
            required
            value={toTeamId}
            onChange={(e) => { setToTeamId(e.target.value); setCollision(null); }}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">Choose team…</option>
            {eligibleTeams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>

        <label className="text-xs font-medium text-gray-600 flex flex-col gap-1">
          Effective date
          <input
            type="date"
            value={effective}
            onChange={(e) => setEffective(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
        </label>

        <label className="text-xs font-medium text-gray-600 flex flex-col gap-1">
          Reason <span className="text-gray-400">(optional, visible to league members)</span>
          <textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
        </label>

        {collision && (
          <div className="border-l-4 border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Jersey #{player.player.jersey_number} is taken by {collision} on the destination team.
            Confirm to clear this player's jersey on transfer — assign a new one after.
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="text-sm px-3 py-2 rounded-lg hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !toTeamId}
            className="text-sm font-medium bg-brand-700 text-white px-4 py-2 rounded-lg hover:bg-brand-800 disabled:opacity-50"
          >
            {saving
              ? 'Saving…'
              : collision
                ? 'Confirm & clear jersey'
                : (isAssignment ? 'Confirm assignment' : 'Confirm trade')}
          </button>
        </div>
      </form>
    </div>
  );
}
