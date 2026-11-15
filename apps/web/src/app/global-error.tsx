'use client';

import type { JSX } from 'react';
import './globals.css';
import { ErrorScreen } from '@/components/errors/ErrorScreen';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): JSX.Element {
  return (
    <html lang="en" data-theme="light">
      <body>
        <ErrorScreen
          title="Something went wrong"
          body="The page hit an error. Your data is safe."
          actionLabel="Try again"
          onAction={reset}
          error={error}
          homeHref="/"
        />
      </body>
    </html>
  );
}
