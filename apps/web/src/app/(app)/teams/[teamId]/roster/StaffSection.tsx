import type { JSX } from 'react';
'use client';

import { useState, useEffect, useTransition } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';
import { inviteStaffAction, lookupUserByEmailAction } from './staff/new/actions';
import {
  removeMemberAction,
  removeInvitationAction,
  updateStaffMemberAction,
  updateInvitationAction,
} from './member-actions';

const ROLE_OPTIONS = [
  { value: 'assistant_coach',   label: 'Assistant Coach' },
  { value: 'athletic_director', label: 'Athletic Director' },
  { value: 'scorekeeper',       label: 'Scorekeeper' },
  { value: 'staff',             label: 'Staff' },
  { value: 'head_coach',        label: 'Head Coach' },
] as const;

const ROLE_LABELS: Record<string, string> = {
  head_coach: 'Head Coach',
  assistant_coach: 'Assistant Coach',
  athletic_director: 'Athletic Director',
  scorekeeper: 'Scorekeeper',
  staff: 'Staff',
};

const inputClass =
  'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent';

const selectClass =
  'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-brand-800 disabled:opacity-50 transition-colors"
    >
      {pending ? 'Saving...' : 'Add to team'}
    </button>
  );
}

type StaffMember = {
  id: string;
  userId: string;
  role: string;
  jerseyNumber: number | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
};

type PendingInvitation = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  role: string;
  jerseyNumber: number | null;
};

type ExistingUser = { id: string; firstName: string; lastName: string } | null;

type EditingConfirmed = {
  type: 'confirmed';
  memberId: string;
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role: string;
  jerseyNumber: string;
};

type EditingPending = {
  type: 'pending';
  invitationId: string;
  firstName: string;
  lastName: string;
  phone: string;
  role: string;
  jerseyNumber: string;
};

type EditingState = EditingConfirmed | EditingPending | null;

export function StaffSection({
  teamId,
  staff,
  pendingInvitations,
  canInvite,
}: {
  teamId: string;
  staff: StaffMember[];
  pendingInvitations: PendingInvitation[];
  canInvite: boolean;
}): JSX.Element | null {
  const [open, setOpen] = useState(false);
  const [result, action] = useFormState(inviteStaffAction, null);
  const [emailInput, setEmailInput] = useState('');
  const [existingUser, setExistingUser] = useState<ExistingUser>(undefined as any);
  const [isLooking, startLookup] = useTransition();
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

  useEffect(() => {
    const trimmed = emailInput.trim();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setExistingUser(null);
      return;
    }
    const timer = setTimeout(() => {
      startLookup(async () => {
        const found = await lookupUserByEmailAction(trimmed);
        setExistingUser(found);
      });
    }, 600);
    return () => clearTimeout(timer);
  }, [emailInput]);

  const handleClose = () => {
    setOpen(false);
    setEmailInput('');
    setExistingUser(null);
  };

  async function handleRemoveMember(memberId: string) {
    if (!window.confirm('Remove this staff member from the team?')) return;
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
    const jersey = editing.jerseyNumber.trim()
      ? parseInt(editing.jerseyNumber, 10)
      : null;
    if (editing.type === 'confirmed') {
      err = await updateStaffMemberAction(teamId, editing.memberId, editing.userId, {
        firstName: editing.firstName,
        lastName: editing.lastName,
        email: editing.email,
        phone: editing.phone,
        role: editing.role,
        jerseyNumber: jersey,
      });
    } else {
      err = await updateInvitationAction(teamId, editing.invitationId, {
        firstName: editing.firstName,
        lastName: editing.lastName,
        phone: editing.phone,
        role: editing.role,
        jerseyNumber: jersey,
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
          <h2 className="text-base font-semibold text-gray-900">Coaches &amp; Staff</h2>
          <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-medium">
            {staff.length + pendingInvitations.length}
          </span>
        </div>
        {canInvite && (
          <button
            onClick={() => setOpen((o) => !o)}
            className="text-xs text-brand-700 hover:underline font-medium"
          >
            {open ? 'Cancel' : '+ Add coach / staff'}
          </button>
        )}
      </div>

      {open && (
        <div className="mb-4 bg-gray-50 border border-gray-200 rounded-xl p-5">
          <p className="text-sm font-semibold text-gray-800 mb-4">Add Coach / Staff</p>
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

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Role <span className="text-red-500">*</span>
              </label>
              <select name="role" required className={selectClass} defaultValue="assistant_coach">
                {ROLE_OPTIONS.map(({ value, label }) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Jersey #</label>
                <input type="number" name="jerseyNumber" min={0} max={99} className={inputClass} placeholder="00" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  name="email"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  className={inputClass}
                  placeholder="coach@example.com"
                  autoComplete="email"
                />
                {isLooking && (
                  <p className="text-xs text-gray-400 mt-1">Looking up…</p>
                )}
                {!isLooking && existingUser && (
                  <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded px-2 py-1 mt-1">
                    Found existing account:{' '}
                    <strong>
                      {existingUser.firstName || existingUser.lastName
                        ? `${existingUser.firstName} ${existingUser.lastName}`.trim()
                        : 'Account found (no name set)'}
                    </strong>{' '}
                    — will be added directly.
                  </p>
                )}
                {!isLooking && existingUser === null && emailInput && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailInput) && (
                  <p className="text-xs text-gray-400 mt-1">
                    No account found — an invite email will be sent.
                  </p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Phone</label>
                <input type="tel" name="phone" className={inputClass} placeholder="(555) 000-0000" />
              </div>
            </div>

            {isSuccess && (
              <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                {result === 'added'
                  ? 'Staff member added to the team.'
                  : 'Invite email sent. They will be added when they accept.'}
              </div>
            )}
            {result && !isSuccess && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {result}
              </p>
            )}

            <div className="flex items-center gap-3">
              <SubmitButton />
              <button type="button" onClick={handleClose} className="text-sm text-gray-500 hover:text-gray-700">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {staff.length === 0 && pendingInvitations.length === 0 ? (
        <p className="text-sm text-gray-400 py-4">No coaching staff added yet.</p>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-12">#</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Name</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Role</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Email</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Phone</th>
                {canInvite && (
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {staff.map((member) => {
                const isEditingThis =
                  editing?.type === 'confirmed' && editing.memberId === member.id;
                return isEditingThis ? (
                  <tr key={member.id} className="bg-gray-50">
                    <td colSpan={canInvite ? 6 : 5} className="px-4 py-4">
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
                        <div className="grid grid-cols-4 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Jersey #</label>
                            <input
                              type="number"
                              min={0} max={99}
                              className={inputClass}
                              value={(editing as EditingConfirmed).jerseyNumber}
                              onChange={(e) => setEditing({ ...editing as EditingConfirmed, jerseyNumber: e.target.value })}
                              placeholder="00"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Role</label>
                            <select
                              className={selectClass}
                              value={(editing as EditingConfirmed).role}
                              onChange={(e) => setEditing({ ...editing as EditingConfirmed, role: e.target.value })}
                            >
                              {ROLE_OPTIONS.map(({ value, label }) => (
                                <option key={value} value={value}>{label}</option>
                              ))}
                            </select>
                          </div>
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
                        {editError && (
                          <p className="text-sm text-red-600">{editError}</p>
                        )}
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
                  <tr key={member.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-gray-500">
                      {member.jerseyNumber != null ? member.jerseyNumber : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {member.firstName || member.lastName
                        ? `${member.firstName ?? ''} ${member.lastName ?? ''}`.trim()
                        : <span className="text-gray-400 italic">Unknown</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs bg-brand-50 text-brand-700 border border-brand-200 px-2 py-0.5 rounded-full">
                        {ROLE_LABELS[member.role] ?? member.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {member.email ?? <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {member.phone ?? <span className="text-gray-300">—</span>}
                    </td>
                    {canInvite && (
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <button
                          onClick={() => setEditing({
                            type: 'confirmed',
                            memberId: member.id,
                            userId: member.userId,
                            firstName: member.firstName ?? '',
                            lastName: member.lastName ?? '',
                            email: member.email ?? '',
                            phone: member.phone ?? '',
                            role: member.role,
                            jerseyNumber: member.jerseyNumber != null ? String(member.jerseyNumber) : '',
                          })}
                          className="text-xs text-brand-700 hover:underline mr-3"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleRemoveMember(member.id)}
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
                const isPlaceholder = inv.email.includes('@placeholder.internal');
                const displayEmail = isPlaceholder ? null : inv.email;
                const displayName = (inv.firstName || inv.lastName)
                  ? `${inv.firstName ?? ''} ${inv.lastName ?? ''}`.trim()
                  : null;
                const isEditingThis =
                  editing?.type === 'pending' && editing.invitationId === inv.id;
                return isEditingThis ? (
                  <tr key={inv.id} className="bg-gray-50">
                    <td colSpan={canInvite ? 6 : 5} className="px-4 py-4">
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
                        <div className="grid grid-cols-3 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Jersey #</label>
                            <input
                              type="number"
                              min={0} max={99}
                              className={inputClass}
                              value={(editing as EditingPending).jerseyNumber}
                              onChange={(e) => setEditing({ ...editing as EditingPending, jerseyNumber: e.target.value })}
                              placeholder="00"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Role</label>
                            <select
                              className={selectClass}
                              value={(editing as EditingPending).role}
                              onChange={(e) => setEditing({ ...editing as EditingPending, role: e.target.value })}
                            >
                              {ROLE_OPTIONS.map(({ value, label }) => (
                                <option key={value} value={value}>{label}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Phone</label>
                            <input
                              className={inputClass}
                              value={(editing as EditingPending).phone}
                              onChange={(e) => setEditing({ ...editing as EditingPending, phone: e.target.value })}
                            />
                          </div>
                        </div>
                        {editError && (
                          <p className="text-sm text-red-600">{editError}</p>
                        )}
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
                    <td className="px-4 py-3 font-mono text-gray-500">
                      {inv.jerseyNumber != null ? inv.jerseyNumber : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      <div className="flex items-center gap-2">
                        {displayName
                          ? displayName
                          : displayEmail
                            ? <span className="text-gray-400 italic">{displayEmail}</span>
                            : <span className="text-gray-400 italic">Unknown</span>}
                        <span className="text-xs bg-yellow-50 text-yellow-700 border border-yellow-200 px-1.5 py-0.5 rounded-full font-normal">
                          Pending
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs bg-brand-50 text-brand-700 border border-brand-200 px-2 py-0.5 rounded-full">
                        {ROLE_LABELS[inv.role] ?? inv.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {displayEmail ?? <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {inv.phone ?? <span className="text-gray-300">—</span>}
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
                            role: inv.role,
                            jerseyNumber: inv.jerseyNumber != null ? String(inv.jerseyNumber) : '',
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
