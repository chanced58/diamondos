'use client';

import type { JSX } from 'react';
import { useState } from 'react';
import type { LeaguePlayerRow } from '@baseball/database';
import { releasePlayer } from './actions';

type Props = {
  leagueId: string;
  player: LeaguePlayerRow;
  onClose: () => void;
  onSuccess: () => void;
};

export function ReleasePlayerDialog({ leagueId, player, onClose, onSuccess }: Props): JSX.Element {
  const fullName = `${player.player.first_name} ${player.player.last_name}`;
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      const res = await releasePlayer({
        leagueId,
        playerId: player.player.id,
        reason: reason || undefined,
      });
      if (!res.ok) {
        if (res.code === 'IN_PROGRESS_GAME') {
          setErr(`Cannot release — ${fullName} is in a live game. Finalize the game first.`);
          return;
        }
        setErr(res.message);
        return;
      }
      onSuccess();
    } catch (error) {
      console.error('ReleasePlayerDialog submit failed', {
        leagueId, playerId: player.player.id, error,
      });
      setErr('Unable to release player right now. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <form onSubmit={submit} className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
        <h2 className="text-lg font-semibold">Release {fullName}</h2>
        <p className="text-sm text-gray-600">
          {fullName} will be moved off <strong>{player.player.team?.name}</strong> into the
          free-agent pool. Their season stats remain attributed to that team.
        </p>

        {err && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-3 py-2">
            {err}
          </div>
        )}

        <label className="text-xs font-medium text-gray-600 flex flex-col gap-1">
          Reason <span className="text-gray-400">(optional)</span>
          <textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
        </label>

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
            disabled={saving}
            className="text-sm font-medium bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 disabled:opacity-50"
          >
            {saving ? 'Releasing…' : 'Confirm Release'}
          </button>
        </div>
      </form>
    </div>
  );
}
