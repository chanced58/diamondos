import type { JSX, ReactNode } from 'react';

type BadgeTone = 'safe' | 'warning' | 'danger' | 'info' | 'clay';

interface BadgeProps {
  tone?: BadgeTone;
  children: ReactNode;
  dot?: boolean;
}

export function Badge({ tone = 'info', children, dot }: BadgeProps): JSX.Element {
  return (
    <span className={`badge badge-${tone}${dot ? ' badge-dot' : ''}`}>{children}</span>
  );
}
