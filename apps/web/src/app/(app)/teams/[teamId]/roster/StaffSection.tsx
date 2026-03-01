'use client';

import { useState, useEffect } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';
import { inviteStaffAction } from './staff/new/actions';

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
};

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
}) {
  const [open, setOpen] = useState(false);
  const [result, action] = useFormState(inviteStaffAction, null);
  const router = useRouter();

  const isSuccess = result === 'added' || result === 'invited';

  useEffect(() => {
    if (isSuccess) {
      router.refresh();
      const t = setTimeout(() => setOpen(false), 2000);
      return () => clearTimeout(t);
    }
  }, [isSuccess, router]);

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

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  name="email"
                  className={inputClass}
                  placeholder="coach@example.com"
                  autoComplete="email"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Optional — sends an invite to create an account.
                </p>
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
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
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
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Name</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Role</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Email</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Phone</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {staff.map((member) => (
                <tr key={member.id} className="hover:bg-gray-50 transition-colors">
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
                </tr>
              ))}
              {pendingInvitations.map((inv) => (
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
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs bg-brand-50 text-brand-700 border border-brand-200 px-2 py-0.5 rounded-full">
                      {ROLE_LABELS[inv.role] ?? inv.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{inv.email}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {inv.phone ?? <span className="text-gray-300">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
