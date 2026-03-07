'use client';
import type { JSX } from 'react';

import { useState, useEffect } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';
import { inviteParentAction } from './parents/new/actions';
import {
  removeMemberAction,
  removeInvitationAction,
  updateParentMemberAction,
  updateInvitationAction,
} from './member-actions';

const inputClass =
  'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-brand-800 disabled:opacity-50 transition-colors"
    >
      {pending ? 'Saving...' : 'Add parent'}
    </button>
  );
}

type Player = {
  id: string;
  firstName: string;
  lastName: string;
  jerseyNumber: number | null;
};

type PendingInvitation = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  role: string;
};

type ParentRow = {
  id: string;
  userId: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
};

type ParentLink = {
  parentUserId: string;
  playerName: string;
};

type EditingConfirmed = {
  type: 'confirmed';
  memberId: string;
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
};

type EditingPending = {
  type: 'pending';
  invitationId: string;
  firstName: string;
  lastName: string;
  phone: string;
};

type EditingState = EditingConfirmed | EditingPending | null;

export function ParentSection({
  teamId,
  parents,
  parentLinks,
  pendingInvitations,
  players,
  canInvite,
}: {
  teamId: string;
  parents: ParentRow[];
  parentLinks: ParentLink[];
  pendingInvitations: PendingInvitation[];
  players: Player[];
  canInvite: boolean;
}): JSX.Element | null {
  const [open, setOpen] = useState(false);
  const [result, action] = useFormState(inviteParentAction, null);
  const [editing, setEditing] = useState<EditingState>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  const isSuccess = result === 'added' || result === 'invited';

  useEffect(() => {
    if (isSuccess) {
      router.refresh();
      const t = setTimeout(() => setOpen(false), 2000);
      return () => clearTimeout(t);
    }
  }, [isSuccess, router]);

  async function handleRemoveMember(memberId: string) {
    if (!window.confirm('Remove this parent from the team?')) return;
    const err = await removeMemberAction(teamId, memberId);
    if (err) alert(err);
    else router.refresh();
  }

  async function handleRemoveInvitation(invitationId: string) {
    if (!window.confirm('Cancel this invitation?')) return;
    const err = await removeInvitationAction(teamId, invitationId);
    if (err) alert(err);
    else router.refresh();
  }

  async function handleSaveEdit() {
    if (!editing) return;
    setSaving(true);
    setEditError(null);
    let err: string | null;
    if (editing.type === 'confirmed') {
      err = await updateParentMemberAction(teamId, editing.memberId, editing.userId, {
        firstName: editing.firstName,
        lastName: editing.lastName,
        email: editing.email,
        phone: editing.phone,
      });
    } else {
      err = await updateInvitationAction(teamId, editing.invitationId, {
        firstName: editing.firstName,
        lastName: editing.lastName,
        phone: editing.phone,
      });
    }
    setSaving(false);
    if (err) {
      setEditError(err);
    } else {
      setEditing(null);
      router.refresh();
    }
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-gray-900">Parents</h2>
          <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-medium">
            {parents.length + pendingInvitations.length}
          </span>
        </div>
        {canInvite && (
          <button
            onClick={() => setOpen((o) => !o)}
            className="text-xs text-brand-700 hover:underline font-medium"
          >
            {open ? 'Cancel' : '+ Add parent'}
          </button>
        )}
      </div>

      {open && (
        <div className="mb-4 bg-gray-50 border border-gray-200 rounded-xl p-5">
          <p className="text-sm font-semibold text-gray-800 mb-4">Add Parent</p>
          <form action={action} className="space-y-4">
            <input type="hidden" name="teamId" value={teamId} />

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">First name</label>
                <input type="text" name="firstName" className={inputClass} placeholder="Jane" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Last name</label>
                <input type="text" name="lastName" className={inputClass} placeholder="Smith" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  name="email"
                  className={inputClass}
                  placeholder="parent@example.com"
                  autoComplete="email"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Optional — sends an invite to view their player&apos;s practice notes.
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Phone</label>
                <input type="tel" name="phone" className={inputClass} placeholder="(555) 000-0000" />
              </div>
            </div>

            {players.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-2">Linked players</label>
                <div className="space-y-2 border border-gray-200 rounded-lg p-3 max-h-40 overflow-y-auto bg-white">
                  {players.map((p) => (
                    <label key={p.id} className="flex items-center gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        name="playerIds"
                        value={p.id}
                        className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                      />
                      <span className="text-sm text-gray-800">
                        {p.lastName}, {p.firstName}
                        {p.jerseyNumber != null && (
                          <span className="text-gray-400 ml-1.5 font-mono text-xs">#{p.jerseyNumber}</span>
                        )}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {isSuccess && (
              <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                {result === 'added' ? 'Parent added to the team.' : 'Invite email sent. They will be added when they accept.'}
              </div>
            )}
            {result && !isSuccess && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{result}</p>
            )}

            <div className="flex items-center gap-3">
              <SubmitButton />
              <button type="button" onClick={() => setOpen(false)} className="text-sm text-gray-500 hover:text-gray-700">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {parents.length === 0 && pendingInvitations.length === 0 ? (
        <p className="text-sm text-gray-400 py-4">No parents added yet.</p>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Name</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Email</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Linked Players</th>
                {canInvite && (
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {parents.map((parent) => {
                const linked = parentLinks.filter((l) => l.parentUserId === parent.userId);
                const isEditingThis =
                  editing?.type === 'confirmed' && editing.memberId === parent.id;
                return isEditingThis ? (
                  <tr key={parent.id} className="bg-gray-50">
                    <td colSpan={canInvite ? 4 : 3} className="px-4 py-4">
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">First name</label>
                            <input
                              className={inputClass}
                              value={(editing as EditingConfirmed).firstName}
                              onChange={(e) => setEditing({ ...editing as EditingConfirmed, firstName: e.target.value })}
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Last name</label>
                            <input
                              className={inputClass}
                              value={(editing as EditingConfirmed).lastName}
                              onChange={(e) => setEditing({ ...editing as EditingConfirmed, lastName: e.target.value })}
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
                            <input
                              type="email"
                              className={inputClass}
                              value={(editing as EditingConfirmed).email}
                              onChange={(e) => setEditing({ ...editing as EditingConfirmed, email: e.target.value })}
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Phone</label>
                            <input
                              className={inputClass}
                              value={(editing as EditingConfirmed).phone}
                              onChange={(e) => setEditing({ ...editing as EditingConfirmed, phone: e.target.value })}
                            />
                          </div>
                        </div>
                        {editError && <p className="text-sm text-red-600">{editError}</p>}
                        <div className="flex items-center gap-3">
                          <button
                            onClick={handleSaveEdit}
                            disabled={saving}
                            className="bg-brand-700 text-white text-sm font-medium px-4 py-1.5 rounded-lg hover:bg-brand-800 disabled:opacity-50 transition-colors"
                          >
                            {saving ? 'Saving…' : 'Save'}
                          </button>
                          <button
                            onClick={() => { setEditing(null); setEditError(null); }}
                            className="text-sm text-gray-500 hover:text-gray-700"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={parent.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {parent.firstName || parent.lastName
                        ? `${parent.firstName ?? ''} ${parent.lastName ?? ''}`.trim()
                        : <span className="text-gray-400 italic">Unknown</span>}
                      {parent.phone && <div className="text-xs text-gray-400">{parent.phone}</div>}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {parent.email ?? <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {linked.length === 0 ? (
                        <span className="text-xs text-gray-300">No players linked</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {linked.map((l, i) => (
                            <span key={i} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                              {l.playerName}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    {canInvite && (
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <button
                          onClick={() => setEditing({
                            type: 'confirmed',
                            memberId: parent.id,
                            userId: parent.userId,
                            firstName: parent.firstName ?? '',
                            lastName: parent.lastName ?? '',
                            email: parent.email ?? '',
                            phone: parent.phone ?? '',
                          })}
                          className="text-xs text-brand-700 hover:underline mr-3"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleRemoveMember(parent.id)}
                          className="text-xs text-red-600 hover:underline"
                        >
                          Remove
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}

              {pendingInvitations.map((inv) => {
                const isEditingThis =
                  editing?.type === 'pending' && editing.invitationId === inv.id;
                return isEditingThis ? (
                  <tr key={inv.id} className="bg-gray-50">
                    <td colSpan={canInvite ? 4 : 3} className="px-4 py-4">
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">First name</label>
                            <input
                              className={inputClass}
                              value={(editing as EditingPending).firstName}
                              onChange={(e) => setEditing({ ...editing as EditingPending, firstName: e.target.value })}
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Last name</label>
                            <input
                              className={inputClass}
                              value={(editing as EditingPending).lastName}
                              onChange={(e) => setEditing({ ...editing as EditingPending, lastName: e.target.value })}
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Phone</label>
                          <input
                            className={inputClass}
                            value={(editing as EditingPending).phone}
                            onChange={(e) => setEditing({ ...editing as EditingPending, phone: e.target.value })}
                          />
                        </div>
                        {editError && <p className="text-sm text-red-600">{editError}</p>}
                        <div className="flex items-center gap-3">
                          <button
                            onClick={handleSaveEdit}
                            disabled={saving}
                            className="bg-brand-700 text-white text-sm font-medium px-4 py-1.5 rounded-lg hover:bg-brand-800 disabled:opacity-50 transition-colors"
                          >
                            {saving ? 'Saving…' : 'Save'}
                          </button>
                          <button
                            onClick={() => { setEditing(null); setEditError(null); }}
                            className="text-sm text-gray-500 hover:text-gray-700"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={inv.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900">
                      <div className="flex items-center gap-2">
                        {inv.firstName || inv.lastName
                          ? `${inv.firstName ?? ''} ${inv.lastName ?? ''}`.trim()
                          : <span className="text-gray-400 italic">{inv.email}</span>}
                        <span className="text-xs bg-yellow-50 text-yellow-700 border border-yellow-200 px-1.5 py-0.5 rounded-full font-normal">
                          Pending
                        </span>
                      </div>
                      {inv.phone && <div className="text-xs text-gray-400">{inv.phone}</div>}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{inv.email}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-gray-300">—</span>
                    </td>
                    {canInvite && (
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <button
                          onClick={() => setEditing({
                            type: 'pending',
                            invitationId: inv.id,
                            firstName: inv.firstName ?? '',
                            lastName: inv.lastName ?? '',
                            phone: inv.phone ?? '',
                          })}
                          className="text-xs text-brand-700 hover:underline mr-3"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleRemoveInvitation(inv.id)}
                          className="text-xs text-red-600 hover:underline"
                        >
                          Remove
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
