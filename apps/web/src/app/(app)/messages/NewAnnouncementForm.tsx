'use client';

import { useRef, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';
import { postAnnouncementAction } from './announce-actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-brand-800 disabled:opacity-50 transition-colors shrink-0"
    >
      {pending ? 'Posting…' : 'Post'}
    </button>
  );
}

export function NewAnnouncementForm({
  teamId,
  channelId,
}: {
  teamId: string;
  channelId: string;
}) {
  const [open, setOpen] = useState(false);
  const [result, action] = useFormState(postAnnouncementAction, null);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  if (result === 'sent') {
    // Reset form and close after successful post
    formRef.current?.reset();
    router.refresh();
    // Reset state so the form can be used again
    action(new FormData());
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-sm font-medium bg-brand-700 text-white px-3 py-2 rounded-lg hover:bg-brand-800 transition-colors"
      >
        + New Announcement
      </button>
    );
  }

  return (
    <div className="border border-brand-200 rounded-xl bg-brand-50 p-4">
      <p className="text-sm font-semibold text-brand-900 mb-3">New Announcement</p>
      <form ref={formRef} action={action} className="space-y-3">
        <input type="hidden" name="teamId" value={teamId} />
        <input type="hidden" name="channelId" value={channelId} />
        <textarea
          name="body"
          required
          rows={3}
          placeholder="Write your announcement…"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
        />
        {result && result !== 'sent' && (
          <p className="text-xs text-red-600">{result}</p>
        )}
        <div className="flex items-center gap-2">
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
  );
}
