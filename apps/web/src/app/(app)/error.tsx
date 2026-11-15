'use client';

import type { JSX } from 'react';
import { ErrorScreen } from '@/components/errors/ErrorScreen';

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): JSX.Element {
  return (
    <ErrorScreen
      title="Something went wrong"
      body="The page hit an error. Your data is safe."
      actionLabel="Try again"
      onAction={reset}
      error={error}
      homeHref="/dashboard"
    />
  );
}
