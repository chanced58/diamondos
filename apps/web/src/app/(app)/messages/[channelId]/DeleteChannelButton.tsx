'use client';

import type { JSX } from 'react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { deleteChannelAction } from '../delete-actions';

export function DeleteChannelButton({
  channelId,
  channelName,
}: {
  channelId: string;
  channelName: string;
}): JSX.Element {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleDelete() {
    if (!window.confirm(`Delete "${channelName}"? All messages in this channel will be permanently removed.`)) {
      return;
    }

    setPending(true);
    const error = await deleteChannelAction(channelId);
    if (error) {
      alert(error);
      setPending(false);
    } else {
      router.push('/messages');
    }
  }

  return (
    <button
      onClick={handleDelete}
      disabled={pending}
      className="shrink-0 text-xs text-gray-400 hover:text-red-600 px-2 py-1 rounded transition-colors disabled:opacity-50"
      title="Delete channel"
    >
      {pending ? '...' : 'Delete'}
    </button>
  );
}
