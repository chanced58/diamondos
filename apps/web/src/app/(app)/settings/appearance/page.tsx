import type { JSX } from 'react';
import type { Metadata } from 'next';
import { AppearanceSettingsClient } from './AppearanceSettingsClient';

export const metadata: Metadata = { title: 'Appearance' };

export default function AppearancePage(): JSX.Element {
  return (
    <div className="page" style={{ maxWidth: 720 }}>
      <div className="eyebrow">Settings</div>
      <h1 className="display" style={{ fontSize: 34, marginTop: 4 }}>Appearance</h1>
      <p style={{ color: 'var(--app-fg-muted)', fontSize: 14, marginTop: 4, maxWidth: 520 }}>
        Tune DiamondOS to your environment. Theme, density, motion, and visual tone all apply
        instantly and persist on this device.
      </p>
      <AppearanceSettingsClient />
    </div>
  );
}
