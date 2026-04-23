'use client';

import type { JSX, ReactNode } from 'react';
import {
  useAppearance,
  type Theme,
  type Density,
  type Motion,
  type Tone,
} from '@/components/providers/ThemeProvider';
import { DiamondField } from '@/components/ui/DiamondField';
import { CountDots } from '@/components/ui/CountDots';

interface SectionProps<T extends string> {
  title: string;
  description: string;
  value: T;
  set: (v: T) => void;
  options: { v: T; l: string; hint?: string }[];
}

function Section<T extends string>({ title, description, value, set, options }: SectionProps<T>): JSX.Element {
  return (
    <div className="card" style={{ padding: 20, marginTop: 14 }}>
      <div className="between" style={{ alignItems: 'flex-start' }}>
        <div>
          <div className="display" style={{ fontSize: 18 }}>{title}</div>
          <p style={{ fontSize: 13, color: 'var(--app-fg-muted)', marginTop: 4, margin: 0, maxWidth: 420 }}>
            {description}
          </p>
        </div>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))`,
          gap: 8,
          marginTop: 14,
        }}
      >
        {options.map((o) => {
          const active = value === o.v;
          return (
            <button
              key={o.v}
              type="button"
              onClick={() => set(o.v)}
              className="btn"
              style={{
                background: active ? 'var(--app-surface)' : 'var(--app-surface-2)',
                borderColor: active ? 'var(--app-brand-2)' : 'var(--app-border)',
                borderStyle: 'solid',
                borderWidth: active ? 2 : 1,
                padding: '12px',
                justifyContent: 'center',
                flexDirection: 'column',
                gap: 4,
                color: 'var(--app-fg)',
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 700 }}>{o.l}</span>
              {o.hint && (
                <span style={{ fontSize: 11, color: 'var(--app-fg-muted)', fontWeight: 400 }}>
                  {o.hint}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PreviewRow({ title, children }: { title: string; children: ReactNode }): JSX.Element {
  return (
    <div style={{ marginTop: 14 }}>
      <div className="eyebrow" style={{ marginBottom: 8 }}>{title}</div>
      <div
        style={{
          background: 'var(--app-surface-2)',
          padding: 16,
          borderRadius: 12,
          display: 'flex',
          alignItems: 'center',
          gap: 24,
          flexWrap: 'wrap',
          border: '1px solid var(--app-border)',
        }}
      >
        {children}
      </div>
    </div>
  );
}

export function AppearanceSettingsClient(): JSX.Element {
  const { theme, density, motion, tone, setTheme, setDensity, setMotion, setTone } = useAppearance();

  return (
    <>
      <Section<Theme>
        title="Theme"
        description="Light is the default daily. Dark cuts glare in the dugout. Dugout-night is tuned for field lights."
        value={theme}
        set={setTheme}
        options={[
          { v: 'light',  l: 'Light',        hint: 'Default' },
          { v: 'dark',   l: 'Dark',         hint: 'Low glare' },
          { v: 'dugout', l: 'Dugout night', hint: 'Turf accent' },
        ]}
      />

      <Section<Density>
        title="Density"
        description="How tightly packed the UI is. Compact shows more at once; Spacious is easier on eyes outdoors."
        value={density}
        set={setDensity}
        options={[
          { v: 'compact',     l: 'Compact' },
          { v: 'comfortable', l: 'Comfortable' },
          { v: 'spacious',    l: 'Spacious' },
        ]}
      />

      <Section<Motion>
        title="Motion"
        description="Transitions and animations. Honours your OS 'reduce motion' setting by default."
        value={motion}
        set={setMotion}
        options={[
          { v: 'on',  l: 'On' },
          { v: 'off', l: 'Off' },
        ]}
      />

      <Section<Tone>
        title="Visual tone"
        description="How expressive the illustrations feel. Utility is tokens-only; Editorial adds chalk-on-turf detail; Energetic adds glow."
        value={tone}
        set={setTone}
        options={[
          { v: 'utilitarian', l: 'Utility' },
          { v: 'editorial',   l: 'Editorial' },
          { v: 'energetic',   l: 'Energetic' },
        ]}
      />

      <div className="card" style={{ padding: 20, marginTop: 14 }}>
        <div className="display" style={{ fontSize: 18 }}>Preview</div>
        <p style={{ fontSize: 13, color: 'var(--app-fg-muted)', marginTop: 4 }}>
          Your current settings applied live.
        </p>

        <PreviewRow title="Diamond field">
          <DiamondField runners={{ first: true, second: true, third: false }} size={140} variant={tone} />
          <div style={{ flex: 1, minWidth: 180 }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Top of 4</div>
            <CountDots balls={2} strikes={1} outs={1} />
          </div>
        </PreviewRow>

        <PreviewRow title="Buttons">
          <button className="btn btn-primary">Primary</button>
          <button className="btn btn-turf">Turf CTA</button>
          <button className="btn btn-ghost">Ghost</button>
          <button className="btn btn-danger">Danger</button>
        </PreviewRow>
      </div>

      <p style={{ marginTop: 20, fontSize: 12, color: 'var(--app-fg-subtle)' }}>
        Saved on this device. Cross-device sync to your profile is coming — for now, set your
        preferences on each device you use.
      </p>
    </>
  );
}
