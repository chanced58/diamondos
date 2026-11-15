import type { JSX } from 'react';
import Link from 'next/link';

export default function NotFound(): JSX.Element {
  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-4">
      <div className="text-center">
        <h1 className="text-lg font-semibold text-gray-900">Page not found</h1>
        <Link href="/" className="mt-4 inline-block text-sm font-medium text-brand-600 hover:underline">
          Go to home
        </Link>
      </div>
    </div>
  );
}
