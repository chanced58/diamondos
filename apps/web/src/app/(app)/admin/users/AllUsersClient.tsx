'use client';
import type { JSX } from 'react';

import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import {
  updateUserProfileAction,
  togglePlatformAdminAction,
  removeFromTeamAction,
  deleteUserAction,
} from './actions';

const ROLE_LABELS: Record<string, string> = {
  head_coach: 'Head Coach',
  assistant_coach: 'Asst. Coach',
  athletic_director: 'AD',
  scorekeeper: 'Scorekeeper',
  staff: 'Staff',
  player: 'Player',
};

const ROLE_COLORS: Record<string, string> = {
  head_coach: 'bg-brand-50 text-brand-700 border-brand-200',
  assistant_coach: 'bg-blue-50 text-blue-700 border-blue-200',
  athletic_director: 'bg-purple-50 text-purple-700 border-purple-200',
  scorekeeper: 'bg-gray-100 text-gray-600 border-gray-200',
  staff: 'bg-gray-100 text-gray-600 border-gray-200',
  player: 'bg-green-50 text-green-700 border-green-200',
};

type TeamRole = { teamId: string; teamName: string; role: string };

type UserRow = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  isPlatformAdmin: boolean;
  teamRoles: TeamRole[];
};

function SubmitButton({ children, variant = 'default' }: { children: React.ReactNode; variant?: 'default' | 'danger' }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`text-xs font-medium px-2.5 py-1 rounded-md disabled:opacity-50 transition-colors ${
        variant === 'danger'
          ? 'text-red-600 hover:bg-red-50 border border-red-200'
          : 'text-brand-700 hover:bg-brand-50 border border-brand-200'
      }`}
    >
      {pending ? '...' : children}
    </button>
  );
}

function EditUserForm({ user, onClose }: { user: UserRow; onClose: () => void }) {
  const [error, action] = useFormState(updateUserProfileAction, null);

  return (
    <tr className="bg-blue-50/40">
      <td colSpan={5} className="px-4 py-4">
        <form action={action} className="space-y-3">
          <input type="hidden" name="userId" value={user.id} />
          <div className="grid grid-cols-2 gap-3 max-w-lg">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">First Name</label>
              <input
                name="firstName"
                defaultValue={user.firstName ?? ''}
                className="w-full text-sm border border-gray-300 rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Last Name</label>
              <input
                name="lastName"
                defaultValue={user.lastName ?? ''}
                className="w-full text-sm border border-gray-300 rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Email</label>
              <input
                name="email"
                type="email"
                defaultValue={user.email ?? ''}
                className="w-full text-sm border border-gray-300 rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Phone</label>
              <input
                name="phone"
                defaultValue={user.phone ?? ''}
                className="w-full text-sm border border-gray-300 rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex items-center gap-2">
            <SubmitButton>Save Changes</SubmitButton>
            <button
              type="button"
              onClick={onClose}
              className="text-xs text-gray-500 hover:text-gray-700 px-2.5 py-1"
            >
              Cancel
            </button>
          </div>
        </form>
      </td>
    </tr>
  );
}

function ToggleAdminForm({ userId, currentValue }: { userId: string; currentValue: boolean }) {
  const [error, action] = useFormState(togglePlatformAdminAction, null);
  return (
    <form action={action} className="inline">
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="currentValue" value={String(currentValue)} />
      {error && <p className="text-xs text-red-600 mb-1">{error}</p>}
      <SubmitButton variant={currentValue ? 'danger' : 'default'}>
        {currentValue ? 'Revoke Admin' : 'Make Admin'}
      </SubmitButton>
    </form>
  );
}

function RemoveFromTeamForm({ userId, teamId, teamName }: { userId: string; teamId: string; teamName: string }) {
  const [error, action] = useFormState(removeFromTeamAction, null);
  return (
    <form action={action} className="inline">
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="teamId" value={teamId} />
      {error && <p className="text-xs text-red-600">{error}</p>}
      <button
        type="submit"
        className="text-gray-400 hover:text-red-500 ml-1 leading-none"
        title={`Remove from ${teamName}`}
      >
        x
      </button>
    </form>
  );
}

function DeleteUserForm({ userId }: { userId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [error, action] = useFormState(deleteUserAction, null);

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="text-xs font-medium text-red-600 hover:bg-red-50 border border-red-200 px-2.5 py-1 rounded-md transition-colors"
      >
        Delete
      </button>
    );
  }

  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="userId" value={userId} />
      {error && <p className="text-xs text-red-600">{error}</p>}
      <span className="text-xs text-red-600 font-medium">Are you sure?</span>
      <SubmitButton variant="danger">Yes, delete</SubmitButton>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="text-xs text-gray-500 hover:text-gray-700"
      >
        Cancel
      </button>
    </form>
  );
}

export function AllUsersTable({
  users,
  currentUserId,
}: {
  users: UserRow[];
  currentUserId: string;
}): JSX.Element {
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Name
            </th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Email
            </th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Teams & Roles
            </th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Access
            </th>
            <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-right">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {users.map((u) => (
            editingId === u.id ? (
              <EditUserForm key={`edit-${u.id}`} user={u} onClose={() => setEditingId(null)} />
            ) : (
              <tr key={u.id} className="hover:bg-gray-50 transition-colors align-top">
                <td className="px-4 py-3 font-medium text-gray-900">
                  {u.firstName || u.lastName
                    ? `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim()
                    : <span className="text-gray-400 italic">No name</span>}
                  {u.phone && (
                    <div className="text-xs text-gray-400">{u.phone}</div>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-600">
                  {u.email ?? <span className="text-gray-300">&mdash;</span>}
                </td>
                <td className="px-4 py-3">
                  {u.teamRoles.length === 0 ? (
                    <span className="text-gray-300 text-xs">&mdash;</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {u.teamRoles.map((tr) => (
                        <span
                          key={`${tr.teamId}-${tr.role}`}
                          className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${
                            ROLE_COLORS[tr.role] ?? 'bg-gray-100 text-gray-600 border-gray-200'
                          }`}
                        >
                          {tr.teamName}
                          <span className="opacity-70">&middot;</span>
                          {ROLE_LABELS[tr.role] ?? tr.role}
                          {u.id !== currentUserId && (
                            <RemoveFromTeamForm
                              userId={u.id}
                              teamId={tr.teamId}
                              teamName={tr.teamName}
                            />
                          )}
                        </span>
                      ))}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-col gap-1">
                    {u.isPlatformAdmin && (
                      <span className="text-xs bg-red-50 text-red-700 border border-red-200 px-2 py-0.5 rounded-full inline-block w-fit">
                        Platform Admin
                      </span>
                    )}
                    {u.id !== currentUserId && (
                      <ToggleAdminForm userId={u.id} currentValue={u.isPlatformAdmin} />
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center gap-2 justify-end">
                    <button
                      onClick={() => setEditingId(u.id)}
                      className="text-xs font-medium text-brand-700 hover:bg-brand-50 border border-brand-200 px-2.5 py-1 rounded-md transition-colors"
                    >
                      Edit
                    </button>
                    {u.id !== currentUserId && (
                      <DeleteUserForm userId={u.id} />
                    )}
                  </div>
                </td>
              </tr>
            )
          ))}
        </tbody>
      </table>
    </div>
  );
}
