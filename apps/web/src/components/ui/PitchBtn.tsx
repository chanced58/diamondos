'use client';

import type { JSX } from 'react';

export type PitchTone =
  | 'ball' | 'calledK' | 'swingK' | 'foul' | 'inPlay'
  | 'out' | '1B' | '2B' | '3B' | 'HR' | 'err';

const TONE_BG: Record<PitchTone, string> = {
  ball:    'var(--green-100)',
  calledK: 'var(--yellow-100)',
  swingK:  'var(--orange-100)',
  foul:    'var(--clay-50)',
  inPlay:  'var(--brand-100)',
  out:     'var(--red-100)',
  '1B':    'var(--green-100)',
  '2B':    'var(--turf-200)',
  '3B':    'var(--blue-100)',
  HR:      'var(--brand-100)',
  err:     'var(--yellow-100)',
};

const TONE_FG: Record<PitchTone, string> = {
  ball:    'var(--green-700)',
  calledK: 'var(--yellow-700)',
  swingK:  'var(--orange-700)',
  foul:    'var(--clay-700)',
  inPlay:  'var(--brand-700)',
  out:     'var(--red-700)',
  '1B':    'var(--green-700)',
  '2B':    'var(--turf-800)',
  '3B':    'var(--blue-700)',
  HR:      'var(--brand-700)',
  err:     'var(--yellow-700)',
};

interface PitchBtnProps {
  label: string;
  tone: PitchTone;
  hot?: string;
  wide?: boolean;
  onClick?: () => void;
}

export function PitchBtn({ label, tone, hot, wide, onClick }: PitchBtnProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className="btn pitch-btn"
      style={{
        background: TONE_BG[tone],
        color: TONE_FG[tone],
        padding: '14px 12px',
        borderRadius: 12,
        fontSize: 14,
        fontWeight: 700,
        gridColumn: wide ? '1 / -1' : undefined,
        transition: 'transform 100ms var(--ease), filter var(--mo) var(--ease)',
        border: '1px solid rgba(0,0,0,0.03)',
        justifyContent: 'center',
      }}
    >
      {label}
      {hot && (
        <kbd style={{ marginLeft: 8, opacity: 0.75 }}>{hot}</kbd>
      )}
    </button>
  );
}
