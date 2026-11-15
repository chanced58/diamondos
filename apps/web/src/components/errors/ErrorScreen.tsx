'use client';

import { useEffect, useRef, type JSX } from 'react';
import Link from 'next/link';
import { reportClientError } from '@/lib/errors/report-client-error';

export interface ErrorScreenProps {
  title: string;
  body: string;
  actionLabel: string;
  onAction: () => void;
  error: Error & { digest?: string };
  homeHref?: string;
}

export function ErrorScreen({
  title,
  body,
  actionLabel,
  onAction,
  error,
  homeHref,
}: ErrorScreenProps): JSX.Element {
  const reportedError = useRef<unknown>(null);

  useEffect(() => {
    if (reportedError.current === error) return;
    reportedError.current = error;
    reportClientError('render', error, {
      pathname: window.location.pathname,
      digest: error.digest,
    });
  }, [error]);

  return (
    <div className="flex min-h-[50vh] items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-6 text-center shadow-sm">
        <h1 className="text-lg font-semibold text-gray-900">{title}</h1>
        <p className="mt-2 text-sm text-gray-600">{body}</p>
        <div className="mt-6 flex flex-col items-center gap-3">
          <button
            type="button"
            onClick={onAction}
            className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            {actionLabel}
          </button>
          {homeHref ? (
            <Link href={homeHref} className="text-sm font-medium text-brand-600 hover:underline">
              Go to home
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
