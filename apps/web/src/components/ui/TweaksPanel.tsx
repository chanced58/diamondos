'use client';

import type { JSX } from 'react';
import { useAppearance, type Theme, type Density, type Motion, type Tone } from '@/components/providers/ThemeProvider';

interface SegProps<T extends string> {
  value: T;
  set: (v: T) => void;
  options: { v: T; l: string }[];
}

function Seg<T extends string>({ value, set, options }: SegProps<T>): JSX.Element {
  return (
    <div className="seg">
      {options.map((o) => (
        <button key={o.v} type="button" className={value === o.v ? 'on' : ''} onClick={() => set(o.v)}>
          {o.l}
        </button>
      ))}
    </div>
  );
}

export function TweaksPanel({ onClose }: { onClose?: () => void } = {}): JSX.Element {
  const { theme, density, motion, tone, setTheme, setDensity, setMotion, setTone } = useAppearance();

  return (
    <div className="tweaks">
      <h4 style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>Tweaks</span>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close tweaks"
            style={{ fontSize: 16, color: 'var(--app-fg-muted)', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            ×
          </button>
        )}
      </h4>
      <div className="tweaks-row">
        <label>Theme</label>
        <Seg<Theme>
          value={theme}
          set={setTheme}
          options={[
            { v: 'light',  l: 'Light' },
            { v: 'dark',   l: 'Dark' },
            { v: 'dugout', l: 'Dugout' },
          ]}
        />
      </div>
      <div className="tweaks-row">
        <label>Density</label>
        <Seg<Density>
          value={density}
          set={setDensity}
          options={[
            { v: 'compact',     l: 'Compact' },
            { v: 'comfortable', l: 'Comfort' },
            { v: 'spacious',    l: 'Spacious' },
          ]}
        />
      </div>
      <div className="tweaks-row">
        <label>Motion</label>
        <Seg<Motion>
          value={motion}
          set={setMotion}
          options={[
            { v: 'on',  l: 'On' },
            { v: 'off', l: 'Off' },
          ]}
        />
      </div>
      <div className="tweaks-row">
        <label>Visual tone</label>
        <Seg<Tone>
          value={tone}
          set={setTone}
          options={[
            { v: 'utilitarian', l: 'Utility' },
            { v: 'editorial',   l: 'Editorial' },
            { v: 'energetic',   l: 'Energetic' },
          ]}
        />
      </div>
      <div style={{ marginTop: 10, fontSize: 11, color: 'var(--app-fg-subtle)' }}>
        Saved on this device. Full settings: <a href="/settings/appearance" style={{ color: 'var(--app-brand-2)' }}>Appearance</a>
      </div>
    </div>
  );
}
