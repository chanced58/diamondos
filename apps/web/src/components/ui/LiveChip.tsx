import type { JSX } from 'react';

export function LiveChip({ label = 'Live' }: { label?: string }): JSX.Element {
  return (
    <span className="live-chip">
      <span className="pulse" />
      {label}
    </span>
  );
}
