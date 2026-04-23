import type { CSSProperties, JSX, ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  interactive?: boolean;
  className?: string;
  style?: CSSProperties;
}

export function Card({ children, interactive, className, style }: CardProps): JSX.Element {
  return (
    <div
      className={['card', interactive ? 'card-interactive' : '', className].filter(Boolean).join(' ')}
      style={style}
    >
      {children}
    </div>
  );
}

export function CardHero({ children, className, style }: Omit<CardProps, 'interactive'>): JSX.Element {
  return (
    <div className={['card card-hero', className].filter(Boolean).join(' ')} style={style}>
      {children}
    </div>
  );
}
