import type { JSX } from 'react';
import { Badge } from '@/components/ui/Badge';

interface CertifiedBadgeProps {
  size?: 'sm' | 'md';
  showLabel?: boolean;
}

export function CertifiedBadge({ size = 'sm', showLabel = true }: CertifiedBadgeProps): JSX.Element {
  return (
    <span
      title="DiamondOS Certified"
      aria-label="DiamondOS Certified"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
    >
      <Badge tone="safe" dot>
        <span style={{ fontSize: size === 'sm' ? 11 : 13 }}>
          {showLabel ? '✓ Certified' : '✓'}
        </span>
      </Badge>
    </span>
  );
}
