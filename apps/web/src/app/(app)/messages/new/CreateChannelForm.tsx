'use client';
import type { JSX } from 'react';

import { useFormState, useFormStatus } from 'react-dom';
import { createChannelAction } from './actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full bg-brand-700 text-white font-semibold py-2.5 rounded-lg hover:bg-brand-800 disabled:opacity-50 transition-colors"
    >
      {pending ? 'Creating...' : 'Create channel'}
    </button>
  );
}

const inputClass =
  'w-full border border-gray-300 rounded-lg px-3 py-2.5 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent';

const selectClass =
  'w-full border border-gray-300 rounded-lg px-3 py-2.5 text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent';

export function CreateChannelForm({ teamId }: { teamId: string }): JSX.Element | null {
  const [error, formAction] = useFormState(createChannelAction, null);

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="teamId" value={teamId} />

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Channel type
        </label>
        <select name="channelType" className={selectClass} defaultValue="topic">
          <option value="topic">
            # Topic — open discussion, everyone can post
          </option>
          <option value="announcement">
            📢 Announcement — coaches post, team reads
          </option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Channel name <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          name="name"
          required
          maxLength={80}
          className={inputClass}
          placeholder="e.g. Pitching, Game Prep"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Description <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        <input
          type="text"
          name="description"
          maxLength={300}
          className={inputClass}
          placeholder="What's this channel for?"
        />
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <SubmitButton />
    </form>
  );
}
