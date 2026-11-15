import type { JSX } from 'react';

export default function AppLoading(): JSX.Element {
  return (
    <div className="space-y-4 p-6" role="status" aria-label="Loading">
      <div className="h-8 w-1/3 animate-pulse rounded bg-gray-200" />
      <div className="h-32 animate-pulse rounded bg-gray-100" />
      <div className="h-32 animate-pulse rounded bg-gray-100" />
    </div>
  );
}
