'use client';

import type { JSX } from 'react';
import { useState } from 'react';
import { createLeaguePlayer } from './actions';

type Team = { id: string; name: string };

type Props = {
  leagueId: string;
  teams: Team[];
  onClose: () => void;
  onSuccess: () => void;
};

const POSITIONS = [
  'pitcher','catcher','first_base','second_base','third_base','shortstop',
  'left_field','center_field','right_field','designated_hitter','utility',
] as const;

type Position = typeof POSITIONS[number];

export function AddLeaguePlayerDialog({ leagueId, teams, onClose, onSuccess }: Props): JSX.Element {
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [dob, setDob] = useState('');
  const [jersey, setJersey] = useState('');
  const [position, setPosition] = useState<Position | ''>('');
  const [teamId, setTeamId] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    const res = await createLeaguePlayer({
      leagueId,
      firstName: first,
      lastName: last,
      dateOfBirth: dob || undefined,
      jerseyNumber: jersey ? Number(jersey) : undefined,
      primaryPosition: (position || undefined) as Position | undefined,
      teamId: teamId || undefined,
    });
    setSaving(false);
    if (!res.ok) {
      setErr(res.code === 'VALIDATION' ? 'Check the form fields' : res.message);
      return;
    }
    onSuccess();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <form onSubmit={submit} className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
        <h2 className="text-lg font-semibold">Add Player to League</h2>
        {err && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-3 py-2">
            {err}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="First name *">
            <input
              required
              value={first}
              onChange={(e) => setFirst(e.target.value)}
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2"
            />
          </Field>
          <Field label="Last name *">
            <input
              required
              value={last}
              onChange={(e) => setLast(e.target.value)}
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2"
            />
          </Field>
          <Field label="Date of birth">
            <input
              type="date"
              value={dob}
              onChange={(e) => setDob(e.target.value)}
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2"
            />
          </Field>
          <Field label="Jersey #">
            <input
              type="number"
              min={0}
              max={99}
              value={jersey}
              onChange={(e) => setJersey(e.target.value)}
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2"
            />
          </Field>
          <Field label="Primary position">
            <select
              value={position}
              onChange={(e) => setPosition(e.target.value as Position | '')}
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2"
            >
              <option value="">—</option>
              {POSITIONS.map((p) => (
                <option key={p} value={p}>{p.replace(/_/g, ' ')}</option>
              ))}
            </select>
          </Field>
          <Field label="Assign to team">
            <select
              value={teamId}
              onChange={(e) => setTeamId(e.target.value)}
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2"
            >
              <option value="">— Free agent —</option>
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </Field>
        </div>
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
            disabled={saving || !first.trim() || !last.trim()}
            className="text-sm font-medium bg-brand-700 text-white px-4 py-2 rounded-lg hover:bg-brand-800 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Add Player'}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <label className="text-xs font-medium text-gray-600 flex flex-col gap-1">
      {label}
      {children}
    </label>
  );
}
