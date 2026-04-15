'use client';

import type { JSX } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { APP_TIERS } from '@baseball/shared';
import { inviteLeagueAdminAction } from './actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-brand-700 text-white text-sm font-semibold px-5 py-2.5 rounded-lg hover:bg-brand-800 disabled:opacity-50 transition-colors"
    >
      {pending ? 'Inviting...' : 'Invite'}
    </button>
  );
}

export function InviteLeagueAdminForm(): JSX.Element {
  const [result, formAction] = useFormState(inviteLeagueAdminAction, null);
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);

  const isSuccess = result?.startsWith('ok:') ?? false;
  const message = isSuccess && result ? result.slice(3) : result;

  // Refresh the page data after a successful invite so the table updates
  useEffect(() => {
    if (isSuccess) {
      formRef.current?.reset();
      router.refresh();
    }
  }, [isSuccess, router]);

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
      <h2 className="text-sm font-semibold text-gray-900 mb-1">Invite League Admin</h2>
      <p className="text-xs text-gray-500 mb-4">
        Send an invite to a new league admin. They will set up their league on first login.
      </p>

      <form ref={formRef} action={formAction} className="flex items-end gap-3 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Email <span className="text-red-500">*</span>
          </label>
          <input
            type="email"
            name="email"
            required
            placeholder="admin@league.org"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
          />
        </div>
        <div className="w-36">
          <label className="block text-xs font-medium text-gray-600 mb-1">
            First name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            name="firstName"
            required
            placeholder="Jane"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
          />
        </div>
        <div className="w-36">
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Last name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            name="lastName"
            required
            placeholder="Doe"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
          />
        </div>
        <div className="w-32">
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Tier
          </label>
          <select
            name="tier"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
          >
            {APP_TIERS.map((t) => (
              <option key={t} value={t}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </option>
            ))}
          </select>
        </div>
        <SubmitButton />
      </form>

      {message && (
        <p className={`mt-3 text-sm rounded-lg px-3 py-2 ${
          isSuccess
            ? 'text-green-700 bg-green-50 border border-green-200'
            : 'text-red-600 bg-red-50 border border-red-200'
        }`}>
          {message}
        </p>
      )}
    </div>
  );
}
