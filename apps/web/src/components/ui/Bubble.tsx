import type { JSX } from 'react';

interface BubbleProps {
  from: string;
  time: string;
  text: string;
  mine?: boolean;
}

export function Bubble({ from, time, text, mine }: BubbleProps): JSX.Element {
  return (
    <div
      style={{
        alignSelf: mine ? 'flex-end' : 'flex-start',
        maxWidth: '72%',
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: 'var(--app-fg-muted)',
          marginBottom: 4,
          letterSpacing: 0.12,
          textTransform: 'uppercase',
          fontWeight: 600,
          textAlign: mine ? 'right' : 'left',
        }}
      >
        {from} · {time}
      </div>
      <div
        style={{
          padding: '10px 14px',
          borderRadius: 14,
          borderBottomRightRadius: mine ? 4 : 14,
          borderBottomLeftRadius: mine ? 14 : 4,
          background: mine
            ? 'linear-gradient(180deg, var(--brand-600), var(--brand-700))'
            : 'var(--app-surface-2)',
          color: mine ? 'white' : 'var(--app-fg)',
          fontSize: 14,
          lineHeight: 1.45,
        }}
      >
        {text}
      </div>
    </div>
  );
}
