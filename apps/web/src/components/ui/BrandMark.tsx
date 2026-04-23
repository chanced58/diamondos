import type { JSX } from 'react';

export function BrandMark({ size = 34 }: { size?: number }): JSX.Element {
  return (
    <div className="sb-logo" style={{ width: size, height: size, fontSize: size * 0.52 }}>
      <span style={{ transform: 'translateY(-1px)' }}>◆</span>
    </div>
  );
}
