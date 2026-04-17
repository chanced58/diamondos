import type { JSX } from 'react';

export default function OfflinePage(): JSX.Element {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-6">
      <div className="text-center space-y-4">
        <h1 className="text-2xl font-bold text-gray-900">You&apos;re Offline</h1>
        <p className="text-gray-500">Check your connection and try again.</p>
      </div>
    </div>
  );
}
