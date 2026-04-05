'use client';

import type { JSX } from 'react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@/lib/supabase/client';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type TeamEntry = {
  id: string;
  teamId: string;
  teamName: string;
  organization: string | null;
  divisionId: string | null;
  isOpponentTeam?: boolean;
};

type Division = {
  id: string;
  league_id: string;
  name: string;
};

type StaffEntry = {
  id: string;
  userId: string;
  role: string;
  name: string;
};

type AvailableTeam = {
  id: string;
  name: string;
  organization: string | null;
};

type AvailableOpponentTeam = {
  id: string;
  name: string;
  city: string | null;
};

interface LeagueAdminClientProps {
  leagueId: string;
  teams: TeamEntry[];
  divisions: Division[];
  staff: StaffEntry[];
  isAdmin: boolean;
  availableTeams?: AvailableTeam[];
  availableOpponentTeams?: AvailableOpponentTeam[];
}

export function LeagueAdminClient({
  leagueId,
  teams,
  divisions,
  staff,
  isAdmin,
  availableTeams,
  availableOpponentTeams,
}: LeagueAdminClientProps): JSX.Element {
  const router = useRouter();
  const [newDivisionName, setNewDivisionName] = useState('');
  const [addTeamId, setAddTeamId] = useState('');
  const [addTeamDivision, setAddTeamDivision] = useState('');
  const [addOpponentTeamId, setAddOpponentTeamId] = useState('');
  const [addOpponentDivision, setAddOpponentDivision] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Cast to any — league tables are not in generated types until `gen-types` runs
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createBrowserClient() as any;

  async function handleAddDivision(e: React.FormEvent) {
    e.preventDefault();
    if (!newDivisionName.trim()) return;
    setSaving(true);
    setErrorMsg(null);
    try {
      const { error } = await supabase.from('league_divisions').insert({
        league_id: leagueId,
        name: newDivisionName.trim(),
      });
      if (error) { setErrorMsg(error.message); return; }
      setNewDivisionName('');
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveDivision(divisionId: string) {
    setSaving(true);
    setErrorMsg(null);
    try {
      const { error } = await supabase.from('league_divisions').delete().eq('id', divisionId);
      if (error) { setErrorMsg(error.message); return; }
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  // Filter out teams already in the league for the dropdown
  const teamsNotInLeague = (availableTeams ?? []).filter(
    (at) => !teams.some((t) => !t.isOpponentTeam && t.teamId === at.id),
  );

  // Filter out opponent teams already in the league
  const opponentTeamsNotInLeague = (availableOpponentTeams ?? []).filter(
    (ot) => !teams.some((t) => t.isOpponentTeam && t.teamId === ot.id),
  );

  async function handleAddTeam(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = addTeamId.trim();
    if (!trimmed) return;
    if (!availableTeams && !UUID_RE.test(trimmed)) {
      setErrorMsg('Team ID must be a valid UUID');
      return;
    }
    setSaving(true);
    setErrorMsg(null);
    try {
      const { error } = await supabase.from('league_members').insert({
        league_id: leagueId,
        team_id: trimmed,
        division_id: addTeamDivision || null,
      });
      if (error) { setErrorMsg(error.message); return; }
      setAddTeamId('');
      setAddTeamDivision('');
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function handleAddOpponentTeam(e: React.FormEvent) {
    e.preventDefault();
    if (!addOpponentTeamId) return;
    setSaving(true);
    setErrorMsg(null);
    try {
      const { error } = await supabase.from('league_members').insert({
        league_id: leagueId,
        opponent_team_id: addOpponentTeamId,
        division_id: addOpponentDivision || null,
      });
      if (error) { setErrorMsg(error.message); return; }
      setAddOpponentTeamId('');
      setAddOpponentDivision('');
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveTeam(membershipId: string) {
    setSaving(true);
    setErrorMsg(null);
    try {
      const { error } = await supabase.from('league_members').delete().eq('id', membershipId);
      if (error) { setErrorMsg(error.message); return; }
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdateTeamDivision(membershipId: string, divisionId: string | null) {
    setSaving(true);
    setErrorMsg(null);
    try {
      const { error } = await supabase
        .from('league_members')
        .update({ division_id: divisionId })
        .eq('id', membershipId);
      if (error) { setErrorMsg(error.message); return; }
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveStaff(staffId: string) {
    setSaving(true);
    setErrorMsg(null);
    try {
      const { error } = await supabase.from('league_staff').delete().eq('id', staffId);
      if (error) { setErrorMsg(error.message); return; }
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-8">
      {errorMsg && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          {errorMsg}
        </div>
      )}

      {/* Divisions */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Divisions</h2>
        </div>
        <div className="p-6 space-y-4">
          {divisions.length === 0 ? (
            <p className="text-sm text-gray-400">No divisions created yet.</p>
          ) : (
            <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg">
              {divisions.map((d) => (
                <li key={d.id} className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm text-gray-900">{d.name}</span>
                  <button
                    onClick={() => handleRemoveDivision(d.id)}
                    disabled={saving}
                    className="text-xs text-red-600 hover:text-red-800"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
          <form onSubmit={handleAddDivision} className="flex gap-2">
            <input
              type="text"
              value={newDivisionName}
              onChange={(e) => setNewDivisionName(e.target.value)}
              placeholder="Division name (e.g. North)"
              className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <button
              type="submit"
              disabled={saving || !newDivisionName.trim()}
              className="text-sm font-medium bg-brand-700 text-white px-4 py-2 rounded-lg hover:bg-brand-800 disabled:opacity-50 transition-colors"
            >
              Add
            </button>
          </form>
        </div>
      </div>

      {/* Teams */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Teams</h2>
        </div>
        <div className="p-6 space-y-4">
          {teams.length === 0 ? (
            <p className="text-sm text-gray-400">No teams in this league yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b border-gray-100">
                  <th className="pb-2">Team</th>
                  <th className="pb-2">Division</th>
                  <th className="pb-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {teams.map((t) => (
                  <tr key={t.id}>
                    <td className="py-3">
                      <span className="font-medium text-gray-900">{t.teamName}</span>
                      {t.organization && (
                        <span className="ml-2 text-xs text-gray-400">{t.organization}</span>
                      )}
                      {t.isOpponentTeam && (
                        <span className="ml-2 text-xs font-medium text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">Opponent</span>
                      )}
                    </td>
                    <td className="py-3">
                      <select
                        value={t.divisionId ?? ''}
                        onChange={(e) => handleUpdateTeamDivision(t.id, e.target.value || null)}
                        className="text-sm border border-gray-300 rounded px-2 py-1"
                      >
                        <option value="">None</option>
                        {divisions.map((d) => (
                          <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                      </select>
                    </td>
                    <td className="py-3 text-right">
                      <button
                        onClick={() => handleRemoveTeam(t.id)}
                        disabled={saving}
                        className="text-xs text-red-600 hover:text-red-800"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <form onSubmit={handleAddTeam} className="flex gap-2">
            {availableTeams ? (
              <select
                value={addTeamId}
                onChange={(e) => { setAddTeamId(e.target.value); setErrorMsg(null); }}
                className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="">Select a team…</option>
                {teamsNotInLeague.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}{t.organization ? ` — ${t.organization}` : ''}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={addTeamId}
                onChange={(e) => { setAddTeamId(e.target.value); setErrorMsg(null); }}
                placeholder="Team ID"
                className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            )}
            {divisions.length > 0 && (
              <select
                value={addTeamDivision}
                onChange={(e) => setAddTeamDivision(e.target.value)}
                className="text-sm border border-gray-300 rounded-lg px-3 py-2"
              >
                <option value="">No division</option>
                {divisions.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            )}
            <button
              type="submit"
              disabled={saving || !addTeamId.trim()}
              className="text-sm font-medium bg-brand-700 text-white px-4 py-2 rounded-lg hover:bg-brand-800 disabled:opacity-50 transition-colors"
            >
              Add Team
            </button>
          </form>

          {/* Add opponent team */}
          {opponentTeamsNotInLeague.length > 0 && (
            <>
              <div className="border-t border-gray-100 pt-4 mt-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Add Opponent Team</p>
              </div>
              <form onSubmit={handleAddOpponentTeam} className="flex gap-2">
                <select
                  value={addOpponentTeamId}
                  onChange={(e) => { setAddOpponentTeamId(e.target.value); setErrorMsg(null); }}
                  className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500"
                >
                  <option value="">Select an opponent team…</option>
                  {opponentTeamsNotInLeague.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}{t.city ? ` — ${t.city}` : ''}
                    </option>
                  ))}
                </select>
                {divisions.length > 0 && (
                  <select
                    value={addOpponentDivision}
                    onChange={(e) => setAddOpponentDivision(e.target.value)}
                    className="text-sm border border-gray-300 rounded-lg px-3 py-2"
                  >
                    <option value="">No division</option>
                    {divisions.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                )}
                <button
                  type="submit"
                  disabled={saving || !addOpponentTeamId}
                  className="text-sm font-medium bg-amber-600 text-white px-4 py-2 rounded-lg hover:bg-amber-700 disabled:opacity-50 transition-colors"
                >
                  Add Opponent
                </button>
              </form>
            </>
          )}
        </div>
      </div>

      {/* Staff */}
      {isAdmin && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">League Staff</h2>
          </div>
          <div className="p-6">
            {staff.length === 0 ? (
              <p className="text-sm text-gray-400">No staff members.</p>
            ) : (
              <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg">
                {staff.map((s) => (
                  <li key={s.id} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <span className="text-sm text-gray-900">{s.name}</span>
                      <span className="ml-2 text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                        {s.role === 'league_admin' ? 'Admin' : 'Manager'}
                      </span>
                    </div>
                    <button
                      onClick={() => handleRemoveStaff(s.id)}
                      disabled={saving}
                      className="text-xs text-red-600 hover:text-red-800"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
