'use client';

import type { ButtonHTMLAttributes, JSX, ReactNode } from 'react';

type Variant = 'primary' | 'turf' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}

const VARIANT_CLASS: Record<Variant, string> = {
  primary: 'btn-primary',
  turf:    'btn-turf',
  ghost:   'btn-ghost',
  danger:  'btn-danger',
};

const SIZE_CLASS: Record<Size, string> = {
  sm: 'btn-sm',
  md: '',
  lg: 'btn-lg',
};

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  children,
  ...rest
}: ButtonProps): JSX.Element {
  return (
    <button
      className={['btn', VARIANT_CLASS[variant], SIZE_CLASS[size], className]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {children}
    </button>
  );
}
