'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import {
  updateMemberRoleAction,
  removeMemberAction,
  cancelInvitationAction,
  resendInvitationAction,
  linkParentToPlayerAction,
  unlinkParentFromPlayerAction,
  connectPlayerToAccountAction,
  resendPlayerInviteAction,
} from './actions';

const STAFF_ROLES = [
  { value: 'head_coach',        label: 'Head Coach' },
  { value: 'assistant_coach',   label: 'Assistant Coach' },
  { value: 'athletic_director', label: 'Athletic Director' },
  { value: 'scorekeeper',       label: 'Scorekeeper' },
  { value: 'staff',             label: 'Staff' },
];

function ActionButton({
  children,
  variant = 'default',
}: {
  children: React.ReactNode;
  variant?: 'default' | 'danger';
}) {
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

type Member = {
  id: string;
  userId: string;
  role: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
};

type Player = {
  id: string;
  firstName: string;
  lastName: string;
  jerseyNumber: number | null;
  primaryPosition: string | null;
  email: string | null;
  phone: string | null;
  hasAccount: boolean;
};

type Parent = {
  id: string;
  userId: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
};

type ParentLink = {
  parentUserId: string;
  playerId: string;
  playerName: string;
};

type Invitation = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  role: string;
  invitedAt: string;
};

function RemoveMemberForm({ memberId, teamId }: { memberId: string; teamId: string }) {
  const [error, action] = useFormState(removeMemberAction, null);
  return (
    <form action={action}>
      <input type="hidden" name="teamId" value={teamId} />
      <input type="hidden" name="memberId" value={memberId} />
      {error && <p className="text-xs text-red-600 mb-1">{error}</p>}
      <ActionButton variant="danger">Remove</ActionButton>
    </form>
  );
}

function UpdateRoleForm({
  memberId,
  teamId,
  currentRole,
}: {
  memberId: string;
  teamId: string;
  currentRole: string;
}) {
  const [error, action] = useFormState(updateMemberRoleAction, null);
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="teamId" value={teamId} />
      <input type="hidden" name="memberId" value={memberId} />
      <select
        name="role"
        defaultValue={currentRole}
        className="text-xs border border-gray-300 rounded-md px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-brand-500"
      >
        {STAFF_ROLES.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </select>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <ActionButton>Save</ActionButton>
    </form>
  );
}

function CancelInviteForm({ invitationId, teamId }: { invitationId: string; teamId: string }) {
  const [error, action] = useFormState(cancelInvitationAction, null);
  return (
    <form action={action}>
      <input type="hidden" name="teamId" value={teamId} />
      <input type="hidden" name="invitationId" value={invitationId} />
      {error && <p className="text-xs text-red-600 mb-1">{error}</p>}
      <ActionButton variant="danger">Cancel</ActionButton>
    </form>
  );
}

function ResendInviteForm({
  invitationId,
  teamId,
  email,
  role,
}: {
  invitationId: string;
  teamId: string;
  email: string;
  role: string;
}) {
  const [error, action] = useFormState(resendInvitationAction, null);
  return (
    <form action={action}>
      <input type="hidden" name="teamId" value={teamId} />
      <input type="hidden" name="invitationId" value={invitationId} />
      <input type="hidden" name="email" value={email} />
      <input type="hidden" name="role" value={role} />
      {error && <p className="text-xs text-red-600 mb-1">{error}</p>}
      <ActionButton>Resend</ActionButton>
    </form>
  );
}

function ResendPlayerInviteForm({ playerId, teamId }: { playerId: string; teamId: string }) {
  const [result, action] = useFormState(resendPlayerInviteAction, null);
  return (
    <form action={action}>
      <input type="hidden" name="teamId" value={teamId} />
      <input type="hidden" name="playerId" value={playerId} />
      {result && result !== 'invited' && (
        <p className="text-xs text-red-600 mb-1">{result}</p>
      )}
      <ActionButton>{result === 'invited' ? 'Sent ✓' : 'Resend invite'}</ActionButton>
    </form>
  );
}

function ConnectAccountForm({ playerId, teamId }: { playerId: string; teamId: string }) {
  const [open, setOpen] = useState(false);
  const [error, action] = useFormState(connectPlayerToAccountAction, null);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs font-medium text-brand-700 hover:bg-brand-50 border border-brand-200 px-2.5 py-1 rounded-md transition-colors"
      >
        Connect account
      </button>
    );
  }

  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="teamId" value={teamId} />
      <input type="hidden" name="playerId" value={playerId} />
      <input
        type="email"
        name="email"
        required
        placeholder="player@example.com"
        className="text-xs border border-gray-300 rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-brand-500 w-44"
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
      <ActionButton>Send invite</ActionButton>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="text-xs text-gray-400 hover:text-gray-600"
      >
        ✕
      </button>
    </form>
  );
}

function UnlinkPlayerChip({
  parentUserId,
  playerId,
  teamId,
  playerName,
}: {
  parentUserId: string;
  playerId: string;
  teamId: string;
  playerName: string;
}) {
  const [, action] = useFormState(unlinkParentFromPlayerAction, null);
  return (
    <form action={action} className="inline-flex">
      <input type="hidden" name="teamId" value={teamId} />
      <input type="hidden" name="parentUserId" value={parentUserId} />
      <input type="hidden" name="playerId" value={playerId} />
      <span className="text-xs bg-gray-100 text-gray-700 pl-2 pr-1 py-0.5 rounded-full inline-flex items-center gap-1">
        {playerName}
        <button
          type="submit"
          className="text-gray-400 hover:text-red-500 leading-none"
          title="Unlink player"
        >
          ✕
        </button>
      </span>
    </form>
  );
}

function LinkPlayerForm({
  parentUserId,
  teamId,
  players,
  linkedPlayerIds,
}: {
  parentUserId: string;
  teamId: string;
  players: Player[];
  linkedPlayerIds: string[];
}) {
  const [open, setOpen] = useState(false);
  const [error, action] = useFormState(linkParentToPlayerAction, null);

  const unlinked = players.filter((p) => !linkedPlayerIds.includes(p.id));
  if (unlinked.length === 0) return null;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs font-medium text-brand-700 hover:bg-brand-50 border border-brand-200 px-2.5 py-1 rounded-md transition-colors"
      >
        + Link player
      </button>
    );
  }

  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="teamId" value={teamId} />
      <input type="hidden" name="parentUserId" value={parentUserId} />
      <select
        name="playerId"
        className="text-xs border border-gray-300 rounded-md px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-brand-500"
      >
        {unlinked.map((p) => (
          <option key={p.id} value={p.id}>
            {p.lastName}, {p.firstName}
            {p.jerseyNumber != null ? ` (#${p.jerseyNumber})` : ''}
          </option>
        ))}
      </select>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <ActionButton>Link</ActionButton>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="text-xs text-gray-400 hover:text-gray-600"
      >
        ✕
      </button>
    </form>
  );
}

function SectionHeader({ title, count, action }: { title: string; count: number; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <h2 className="text-base font-semibold text-gray-900">{title}</h2>
        <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-medium">
          {count}
        </span>
      </div>
      {action}
    </div>
  );
}

export function UsersPageClient({
  teamId,
  members,
  players,
  pendingInvitations,
  parents,
  parentLinks,
  roleLabels,
  currentUserId,
}: {
  teamId: string;
  members: Member[];
  players: Player[];
  pendingInvitations: Invitation[];
  parents: Parent[];
  parentLinks: ParentLink[];
  roleLabels: Record<string, string>;
  currentUserId: string;
}) {
  return (
    <div className="space-y-10">
      {/* ── Coaching Staff ──────────────────────────────────────── */}
      <section>
        <SectionHeader
          title="Coaching Staff"
          count={members.length}
          action={
            <Link
              href={`/teams/${teamId}/roster/staff/new`}
              className="text-xs text-brand-700 hover:underline font-medium"
            >
              + Invite staff
            </Link>
          }
        />

        {members.length === 0 ? (
          <p className="text-sm text-gray-400 py-4">No staff members yet.</p>
        ) : (
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
                    Role
                  </th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {members.map((m) => (
                  <tr key={m.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {m.firstName || m.lastName
                        ? `${m.firstName ?? ''} ${m.lastName ?? ''}`.trim()
                        : <span className="text-gray-400 italic">Unknown</span>}
                      {m.phone && (
                        <div className="text-xs text-gray-400">{m.phone}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {m.email ?? <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {m.userId === currentUserId ? (
                        <span className="text-xs bg-brand-50 text-brand-700 border border-brand-200 px-2 py-0.5 rounded-full">
                          {roleLabels[m.role] ?? m.role}
                        </span>
                      ) : (
                        <UpdateRoleForm
                          memberId={m.id}
                          teamId={teamId}
                          currentRole={m.role}
                        />
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {m.userId !== currentUserId && (
                        <RemoveMemberForm memberId={m.id} teamId={teamId} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Players ─────────────────────────────────────────────── */}
      <section>
        <SectionHeader
          title="Players"
          count={players.length}
          action={
            <Link
              href={`/teams/${teamId}/roster/new`}
              className="text-xs text-brand-700 hover:underline font-medium"
            >
              + Add player
            </Link>
          }
        />

        {players.length === 0 ? (
          <p className="text-sm text-gray-400 py-4">No players on the roster yet.</p>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    #
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Name
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Contact
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Account
                  </th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {players.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-gray-400 font-mono text-xs">
                      {p.jerseyNumber != null ? `#${p.jerseyNumber}` : '—'}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      <Link
                        href={`/teams/${teamId}/roster/${p.id}`}
                        className="hover:text-brand-700 hover:underline"
                      >
                        {p.firstName} {p.lastName}
                      </Link>
                      {p.primaryPosition && (
                        <div className="text-xs text-gray-400 capitalize">
                          {p.primaryPosition.replace(/_/g, ' ')}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {p.email ? (
                        <div>
                          <div>{p.email}</div>
                          {p.phone && <div className="text-xs text-gray-400">{p.phone}</div>}
                        </div>
                      ) : p.phone ? (
                        p.phone
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {p.hasAccount ? (
                        <span className="text-xs bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-full">
                          Active
                        </span>
                      ) : p.email ? (
                        <span className="text-xs bg-yellow-50 text-yellow-700 border border-yellow-200 px-2 py-0.5 rounded-full">
                          Invited
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">No account</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center gap-2 justify-end">
                        {!p.hasAccount && (
                          p.email
                            ? <ResendPlayerInviteForm playerId={p.id} teamId={teamId} />
                            : <ConnectAccountForm playerId={p.id} teamId={teamId} />
                        )}
                        <Link
                          href={`/teams/${teamId}/roster/${p.id}`}
                          className="text-xs text-brand-700 hover:underline"
                        >
                          Edit
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Parents ─────────────────────────────────────────────── */}
      <section>
        <SectionHeader
          title="Parents"
          count={parents.length}
          action={
            <Link
              href={`/teams/${teamId}/roster/parents/new`}
              className="text-xs text-brand-700 hover:underline font-medium"
            >
              + Add parent
            </Link>
          }
        />

        {parents.length === 0 ? (
          <p className="text-sm text-gray-400 py-4">No parents added yet.</p>
        ) : (
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
                    Linked Players
                  </th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {parents.map((parent) => {
                  const linked = parentLinks.filter((l) => l.parentUserId === parent.userId);
                  const linkedIds = linked.map((l) => l.playerId);
                  return (
                    <tr key={parent.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {parent.firstName || parent.lastName
                          ? `${parent.firstName ?? ''} ${parent.lastName ?? ''}`.trim()
                          : <span className="text-gray-400 italic">Unknown</span>}
                        {parent.phone && (
                          <div className="text-xs text-gray-400">{parent.phone}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {parent.email ?? <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-1">
                          {linked.map((l) => (
                            <UnlinkPlayerChip
                              key={l.playerId}
                              parentUserId={parent.userId}
                              playerId={l.playerId}
                              teamId={teamId}
                              playerName={l.playerName}
                            />
                          ))}
                          <LinkPlayerForm
                            parentUserId={parent.userId}
                            teamId={teamId}
                            players={players}
                            linkedPlayerIds={linkedIds}
                          />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <RemoveMemberForm memberId={parent.id} teamId={teamId} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Pending Invitations ──────────────────────────────────── */}
      <section>
        <SectionHeader title="Pending Invitations" count={pendingInvitations.length} />

        {pendingInvitations.length === 0 ? (
          <p className="text-sm text-gray-400 py-4">No pending invitations.</p>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Name / Email
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Role
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Invited
                  </th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pendingInvitations.map((inv) => (
                  <tr key={inv.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      {(inv.firstName || inv.lastName) && (
                        <div className="font-medium text-gray-900">
                          {[inv.firstName, inv.lastName].filter(Boolean).join(' ')}
                        </div>
                      )}
                      <div className="text-gray-500">{inv.email}</div>
                      {inv.phone && <div className="text-xs text-gray-400">{inv.phone}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                        {roleLabels[inv.role] ?? inv.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {new Date(inv.invitedAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 justify-end">
                        {!inv.email.endsWith('@placeholder.internal') && (
                          <ResendInviteForm
                            invitationId={inv.id}
                            teamId={teamId}
                            email={inv.email}
                            role={inv.role}
                          />
                        )}
                        <CancelInviteForm invitationId={inv.id} teamId={teamId} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
