import type { JSX, ReactNode } from 'react';

/**
 * Scorekeeping content stays Light in every theme. `data-theme="light"` makes
 * this element a Light island: every theme variable re-resolves to its Light
 * value for the subtree. Rendered by `ScoringBoard` itself, so every consumer
 * (the live scorer, the practice demo) gets it. In Light the wrapper is a no-op.
 */
export function ScorerLightScope({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div data-theme="light" className="min-h-full bg-app-bg text-app-fg">
      {children}
    </div>
  );
}
