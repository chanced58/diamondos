'use client';

import type { JSX } from 'react';
import { useState } from 'react';
import Link from 'next/link';
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
  isActive: boolean;
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
  leagueName?: string;
  leagueDescription?: string | null;
  teams: TeamEntry[];
  divisions: Division[];
  staff: StaffEntry[];
  isAdmin: boolean;
  availableTeams?: AvailableTeam[];
  availableOpponentTeams?: AvailableOpponentTeam[];
}

export function LeagueAdminClient({
  leagueId,
  leagueName: initialName,
  leagueDescription: initialDescription,
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
  const [newOpponentName, setNewOpponentName] = useState('');
  const [newOpponentAbbreviation, setNewOpponentAbbreviation] = useState('');
  const [newOpponentCity, setNewOpponentCity] = useState('');
  const [newOpponentState, setNewOpponentState] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [editName, setEditName] = useState(initialName ?? '');
  const [editDescription, setEditDescription] = useState(initialDescription ?? '');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteFirstName, setInviteFirstName] = useState('');
  const [inviteLastName, setInviteLastName] = useState('');
  const [inviteRole, setInviteRole] = useState<'league_admin' | 'league_manager'>('league_manager');
  const [inviteStatus, setInviteStatus] = useState<string | null>(null);

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

  async function handleCreateOpponentTeam(e: React.FormEvent) {
    e.preventDefault();
    if (!newOpponentName.trim()) return;
    setSaving(true);
    setErrorMsg(null);
    try {
      // Create the opponent team owned by the league
      const { data: newTeam, error: insertError } = await supabase
        .from('opponent_teams')
        .insert({
          league_id: leagueId,
          name: newOpponentName.trim(),
          abbreviation: newOpponentAbbreviation.trim() || null,
          city: newOpponentCity.trim() || null,
          state_code: newOpponentState.trim() || null,
        })
        .select('id')
        .single();
      if (insertError) { setErrorMsg(insertError.message); return; }

      // Also add it as a league member
      const { error: memberError } = await supabase
        .from('league_members')
        .insert({
          league_id: leagueId,
          opponent_team_id: newTeam.id,
        });
      if (memberError) {
        // Clean up the orphaned opponent team
        await supabase.from('opponent_teams').delete().eq('id', newTeam.id);
        setErrorMsg(memberError.message);
        return;
      }

      setNewOpponentName('');
      setNewOpponentAbbreviation('');
      setNewOpponentCity('');
      setNewOpponentState('');
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveTeam(membershipId: string) {
    if (!isAdmin) { setErrorMsg('Only league admins can remove teams.'); return; }
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

  async function handleToggleTeamActive(membershipId: string, currentlyActive: boolean) {
    if (!isAdmin) { setErrorMsg('Only league admins can change team status.'); return; }
    setSaving(true);
    setErrorMsg(null);
    try {
      const { error } = await supabase
        .from('league_members')
        .update({ is_active: !currentlyActive })
        .eq('id', membershipId);
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

  async function handleInviteStaff(e: React.FormEvent) {
    e.preventDefault();
    const email = inviteEmail.trim().toLowerCase();
    if (!email) return;
    setSaving(true);
    setErrorMsg(null);
    setInviteStatus(null);
    try {
      const res = await fetch('/api/admin/invite-league-staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leagueId,
          email,
          firstName: inviteFirstName.trim(),
          lastName: inviteLastName.trim(),
          role: inviteRole,
        }),
      });
      let data: { error?: string; message?: string };
      try {
        data = await res.json();
      } catch {
        setErrorMsg(`Server error (${res.status}): failed to parse response`);
        return;
      }
      if (!res.ok) {
        setErrorMsg(data.error ?? 'Failed to invite staff member');
        return;
      }
      setInviteEmail('');
      setInviteFirstName('');
      setInviteLastName('');
      setInviteStatus(data.message ?? 'Staff member invited successfully');
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdateLeague(e: React.FormEvent) {
    e.preventDefault();
    if (!editName.trim()) return;
    setSaving(true);
    setErrorMsg(null);
    try {
      const { error } = await supabase
        .from('leagues')
        .update({
          name: editName.trim(),
          description: editDescription.trim() || null,
        })
        .eq('id', leagueId);
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

      {/* League Details (editable by admins) */}
      {isAdmin && initialName !== undefined && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">League Details</h2>
          </div>
          <form onSubmit={handleUpdateLeague} className="p-6 space-y-4">
            <div>
              <label htmlFor="league-name" className="block text-xs font-medium text-gray-500 mb-1">League Name</label>
              <input
                id="league-name"
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label htmlFor="league-desc" className="block text-xs font-medium text-gray-500 mb-1">Description</label>
              <input
                id="league-desc"
                type="text"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Optional description"
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <button
              type="submit"
              disabled={saving || !editName.trim()}
              className="text-sm font-medium bg-brand-700 text-white px-4 py-2 rounded-lg hover:bg-brand-800 disabled:opacity-50 transition-colors"
            >
              Save Changes
            </button>
          </form>
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
                  <th className="pb-2">Status</th>
                  <th className="pb-2">Division</th>
                  {isAdmin && <th className="pb-2 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {teams.map((t) => (
                  <tr key={t.id} className={t.isActive ? '' : 'opacity-60'}>
                    <td className="py-3">
                      {t.isOpponentTeam ? (
                        <Link
                          href={`/league/admin/opponent-teams/${t.teamId}`}
                          className="font-medium text-brand-700 hover:underline"
                        >
                          {t.teamName}
                        </Link>
                      ) : (
                        <span className={`font-medium ${t.isActive ? 'text-gray-900' : 'text-gray-500'}`}>{t.teamName}</span>
                      )}
                      {t.organization && (
                        <span className="ml-2 text-xs text-gray-400">{t.organization}</span>
                      )}
                      {t.isOpponentTeam && (
                        <span className="ml-2 text-xs font-medium text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">Opponent</span>
                      )}
                    </td>
                    <td className="py-3">
                      {t.isActive ? (
                        <span className="text-xs font-medium text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">Active</span>
                      ) : (
                        <span className="text-xs font-medium text-gray-500 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded-full">Inactive</span>
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
                    {isAdmin && (
                      <td className="py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleToggleTeamActive(t.id, t.isActive)}
                            disabled={saving}
                            className={`text-xs ${t.isActive ? 'text-gray-500 hover:text-gray-700' : 'text-brand-700 hover:text-brand-800'}`}
                          >
                            {t.isActive ? 'Deactivate' : 'Activate'}
                          </button>
                          <span className="text-gray-200">|</span>
                          <button
                            onClick={() => {
                              if (confirm(`Permanently remove ${t.teamName} from this league? This cannot be undone.`)) {
                                handleRemoveTeam(t.id);
                              }
                            }}
                            disabled={saving}
                            className="text-xs text-red-600 hover:text-red-800"
                          >
                            Remove
                          </button>
                        </div>
                      </td>
                    )}
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

          {/* Add existing opponent team (admin only) */}
          {isAdmin && opponentTeamsNotInLeague.length > 0 && (
            <>
              <div className="border-t border-gray-100 pt-4 mt-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Add Existing Opponent Team</p>
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

          {/* Create new opponent team (admin only) */}
          {isAdmin && (
            <>
              <div className="border-t border-gray-100 pt-4 mt-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Create Opponent Team</p>
              </div>
              <form onSubmit={handleCreateOpponentTeam} className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={newOpponentName}
                    onChange={(e) => setNewOpponentName(e.target.value)}
                    placeholder="Team name *"
                    required
                    className="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                  <input
                    type="text"
                    value={newOpponentAbbreviation}
                    onChange={(e) => setNewOpponentAbbreviation(e.target.value)}
                    placeholder="Abbreviation"
                    maxLength={6}
                    className="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={newOpponentCity}
                    onChange={(e) => setNewOpponentCity(e.target.value)}
                    placeholder="City"
                    className="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                  <input
                    type="text"
                    value={newOpponentState}
                    onChange={(e) => setNewOpponentState(e.target.value)}
                    placeholder="State (e.g. TX)"
                    maxLength={2}
                    className="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <button
                  type="submit"
                  disabled={saving || !newOpponentName.trim()}
                  className="text-sm font-medium bg-amber-600 text-white px-4 py-2 rounded-lg hover:bg-amber-700 disabled:opacity-50 transition-colors"
                >
                  Create Opponent Team
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

            {/* Invite Staff */}
            <div className="border-t border-gray-100 pt-4 mt-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Invite Staff Member</p>
              {inviteStatus && (
                <div className="mb-3 bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-sm text-green-700">
                  {inviteStatus}
                </div>
              )}
              <form onSubmit={handleInviteStaff} className="space-y-3">
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="Email address"
                    required
                    className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as 'league_admin' | 'league_manager')}
                    className="text-sm border border-gray-300 rounded-lg px-3 py-2"
                  >
                    <option value="league_manager">Manager</option>
                    <option value="league_admin">Admin</option>
                  </select>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={inviteFirstName}
                    onChange={(e) => setInviteFirstName(e.target.value)}
                    placeholder="First name"
                    className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                  <input
                    type="text"
                    value={inviteLastName}
                    onChange={(e) => setInviteLastName(e.target.value)}
                    placeholder="Last name"
                    className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                  <button
                    type="submit"
                    disabled={saving || !inviteEmail.trim()}
                    className="text-sm font-medium bg-brand-700 text-white px-4 py-2 rounded-lg hover:bg-brand-800 disabled:opacity-50 transition-colors"
                  >
                    Invite
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
