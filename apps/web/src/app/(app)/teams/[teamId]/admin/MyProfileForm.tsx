'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { updateMyProfileAction } from './profile-actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-brand-800 disabled:opacity-50 transition-colors"
    >
      {pending ? 'Saving…' : 'Save Profile'}
    </button>
  );
}

const inputClass =
  'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent';

export function MyProfileForm({
  currentFirstName,
  currentLastName,
  currentPhone,
  email,
}: {
  currentFirstName: string;
  currentLastName: string;
  currentPhone: string | null;
  email: string;
}) {
  const [result, action] = useFormState(updateMyProfileAction, null);

  return (
    <form action={action} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">First name</label>
          <input
            type="text"
            name="firstName"
            required
            defaultValue={currentFirstName}
            placeholder="Jane"
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Last name</label>
          <input
            type="text"
            name="lastName"
            required
            defaultValue={currentLastName}
            placeholder="Smith"
            className={inputClass}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
          <input
            type="text"
            value={email}
            disabled
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-400 bg-gray-50"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Phone</label>
          <input
            type="tel"
            name="phone"
            defaultValue={currentPhone ?? ''}
            placeholder="(555) 000-0000"
            className={inputClass}
          />
        </div>
      </div>

      {result === 'saved' && (
        <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
          Profile updated.
        </p>
      )}
      {result && result !== 'saved' && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {result}
        </p>
      )}

      <SubmitButton />
    </form>
  );
}
