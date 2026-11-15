'use client';

import type { JSX } from 'react';
import { ErrorScreen } from '@/components/errors/ErrorScreen';

/** Stays Light like the scorer content it replaces. */
export default function ScorerError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): JSX.Element {
  return (
    <div data-theme="light" className="min-h-full bg-app-bg text-app-fg">
      <ErrorScreen
        title="The scorer hit an error"
        body="Plays you already recorded are saved. Reload to pick up where you left off."
        actionLabel="Reload scorer"
        onAction={reset}
        error={error}
        homeHref="/dashboard"
      />
    </div>
  );
}
