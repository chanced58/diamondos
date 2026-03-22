import type { JSX } from 'react';
import { Metadata } from 'next';

export const metadata: Metadata = { title: 'Messages' };

export default function MessagesPage(): JSX.Element {
  return (
    <div className="flex-1 flex items-center justify-center bg-white">
      <div className="text-center">
        <span className="text-5xl mb-4 block">💬</span>
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Select a conversation</h2>
        <p className="text-sm text-gray-400">Choose a channel or DM from the sidebar.</p>
      </div>
    </div>
  );
}
