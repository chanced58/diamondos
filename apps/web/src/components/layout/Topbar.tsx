import type { JSX, ReactNode } from 'react';
import { LiveChip } from '@/components/ui/LiveChip';

interface TopbarProps {
  title: string;
  sub?: string;
  eyebrow?: string;
  liveChip?: boolean;
  actions?: ReactNode;
}

export function Topbar({ title, sub, eyebrow, liveChip, actions }: TopbarProps): JSX.Element {
  return (
    <div className="topbar">
      <div>
        {eyebrow && <div className="eyebrow" style={{ marginBottom: 4 }}>{eyebrow}</div>}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h1>{title}</h1>
          {liveChip && <LiveChip />}
        </div>
        {sub && <div className="sub">{sub}</div>}
      </div>
      {actions && <div className="topbar-actions">{actions}</div>}
    </div>
  );
}
