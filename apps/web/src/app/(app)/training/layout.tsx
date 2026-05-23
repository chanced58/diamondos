import type { JSX, ReactNode } from 'react';

export default function TrainingLayout({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div style={{ padding: '24px 28px', maxWidth: 1100, margin: '0 auto', width: '100%' }}>
      {children}
    </div>
  );
}
