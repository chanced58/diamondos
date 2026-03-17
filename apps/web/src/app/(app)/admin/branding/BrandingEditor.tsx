'use client';

import type { JSX } from 'react';
import { useState, useRef } from 'react';

interface SiteSettings {
  id: string;
  logo_url: string | null;
  site_name: string;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  hero_headline: string;
  hero_subtext: string;
  cta_button_text: string;
  form_headline: string;
  form_subtext: string;
  updated_at: string;
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export function BrandingEditor({ initialSettings }: { initialSettings: SiteSettings | null }): JSX.Element {
  const defaults: SiteSettings = {
    id: 'default',
    logo_url: null,
    site_name: 'DiamondOS',
    primary_color: '#1e3a8a',
    secondary_color: '#1d4ed8',
    accent_color: '#eff6ff',
    hero_headline: 'The coaching platform built for baseball.',
    hero_subtext: 'Scorekeeping, communication, practice planning, and compliance — all in one place.',
    cta_button_text: 'Let Us Know',
    form_headline: 'Still Building',
    form_subtext: 'If you are interested, please let us know.',
    updated_at: new Date().toISOString(),
  };

  const [settings, setSettings] = useState<SiteSettings>(initialSettings ?? defaults);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [logoUploading, setLogoUploading] = useState(false);
  const [previewLogo, setPreviewLogo] = useState<string | null>(settings.logo_url);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function update(field: keyof SiteSettings, value: string) {
    setSettings((prev) => ({ ...prev, [field]: value }));
    setSaveStatus('idle');
  }

  async function handleSave() {
    setSaveStatus('saving');
    try {
      const res = await fetch('/api/site-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          site_name: settings.site_name,
          primary_color: settings.primary_color,
          secondary_color: settings.secondary_color,
          accent_color: settings.accent_color,
          hero_headline: settings.hero_headline,
          hero_subtext: settings.hero_subtext,
          cta_button_text: settings.cta_button_text,
          form_headline: settings.form_headline,
          form_subtext: settings.form_subtext,
        }),
      });

      if (!res.ok) throw new Error('Save failed');
      const data = await res.json();
      setSettings(data);
      setSaveStatus('saved');
    } catch {
      setSaveStatus('error');
    }
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Show preview immediately
    const reader = new FileReader();
    reader.onload = (ev) => setPreviewLogo(ev.target?.result as string);
    reader.readAsDataURL(file);

    setLogoUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/site-settings/logo', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? 'Upload failed');
      }

      const data = await res.json();
      setSettings((prev) => ({ ...prev, logo_url: data.logo_url }));
      setPreviewLogo(data.logo_url);
    } catch (err) {
      setPreviewLogo(settings.logo_url);
      alert(err instanceof Error ? err.message : 'Logo upload failed');
    } finally {
      setLogoUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleLogoRemove() {
    setLogoUploading(true);
    try {
      const res = await fetch('/api/site-settings/logo', { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to remove logo');
      setSettings((prev) => ({ ...prev, logo_url: null }));
      setPreviewLogo(null);
    } catch {
      alert('Failed to remove logo');
    } finally {
      setLogoUploading(false);
    }
  }

  return (
    <div className="space-y-10">
      {/* ── Logo Section ──────────────────────────────────────────────────────── */}
      <section className="bg-white border border-gray-200 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Logo</h2>
        <p className="text-sm text-gray-500 mb-5">
          Displayed on the home page, login page, and navigation. PNG, JPEG, SVG, or WebP. Max 5 MB.
        </p>

        <div className="flex items-center gap-6">
          {/* Preview */}
          <div className="shrink-0 w-24 h-24 rounded-xl border-2 border-dashed border-gray-300 flex items-center justify-center bg-gray-50 overflow-hidden">
            {previewLogo ? (
              <img src={previewLogo} alt="Site logo" className="w-full h-full object-contain p-2" />
            ) : (
              <span className="text-3xl text-gray-300">&#x1f4f7;</span>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex gap-2">
              <label className="cursor-pointer px-4 py-2 text-sm font-medium rounded-lg bg-brand-700 text-white hover:bg-brand-600 transition-colors">
                {logoUploading ? 'Uploading...' : 'Upload Logo'}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml,image/webp"
                  className="hidden"
                  onChange={handleLogoUpload}
                  disabled={logoUploading}
                />
              </label>
              {previewLogo && (
                <button
                  onClick={handleLogoRemove}
                  disabled={logoUploading}
                  className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  Remove
                </button>
              )}
            </div>
            <p className="text-xs text-gray-400">
              Recommended: square image, at least 200x200px.
            </p>
          </div>
        </div>
      </section>

      {/* ── Colors Section ────────────────────────────────────────────────────── */}
      <section className="bg-white border border-gray-200 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Colors</h2>
        <p className="text-sm text-gray-500 mb-5">
          Set the brand colors used on the public home page and lead form.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <ColorField
            label="Primary"
            value={settings.primary_color}
            onChange={(v) => update('primary_color', v)}
            description="Main brand color (buttons, links)"
          />
          <ColorField
            label="Secondary"
            value={settings.secondary_color}
            onChange={(v) => update('secondary_color', v)}
            description="Hover states, accents"
          />
          <ColorField
            label="Accent / Background"
            value={settings.accent_color}
            onChange={(v) => update('accent_color', v)}
            description="Light background tints"
          />
        </div>

        {/* Color preview */}
        <div className="mt-6 rounded-lg overflow-hidden border border-gray-200">
          <div className="h-3" style={{ backgroundColor: settings.primary_color }} />
          <div className="p-4" style={{ backgroundColor: settings.accent_color }}>
            <div className="flex items-center gap-3">
              {previewLogo && (
                <img src={previewLogo} alt="" className="w-8 h-8 object-contain" />
              )}
              <span className="font-semibold" style={{ color: settings.primary_color }}>
                {settings.site_name}
              </span>
            </div>
            <div className="mt-3 flex gap-2">
              <span
                className="inline-block px-4 py-1.5 text-sm font-medium rounded-lg text-white"
                style={{ backgroundColor: settings.primary_color }}
              >
                Primary
              </span>
              <span
                className="inline-block px-4 py-1.5 text-sm font-medium rounded-lg text-white"
                style={{ backgroundColor: settings.secondary_color }}
              >
                Secondary
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Messaging Section ─────────────────────────────────────────────────── */}
      <section className="bg-white border border-gray-200 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Messaging</h2>
        <p className="text-sm text-gray-500 mb-5">
          Control the text displayed on the public home page and lead capture form.
        </p>

        <div className="space-y-5">
          <TextField
            label="Site Name"
            value={settings.site_name}
            onChange={(v) => update('site_name', v)}
          />
          <TextField
            label="Hero Headline"
            value={settings.hero_headline}
            onChange={(v) => update('hero_headline', v)}
          />
          <TextAreaField
            label="Hero Subtext"
            value={settings.hero_subtext}
            onChange={(v) => update('hero_subtext', v)}
          />
          <TextField
            label="CTA Button Text"
            value={settings.cta_button_text}
            onChange={(v) => update('cta_button_text', v)}
          />

          <hr className="border-gray-100" />

          <TextField
            label="Form Headline"
            value={settings.form_headline}
            onChange={(v) => update('form_headline', v)}
          />
          <TextField
            label="Form Subtext"
            value={settings.form_subtext}
            onChange={(v) => update('form_subtext', v)}
          />
        </div>
      </section>

      {/* ── Save Bar ──────────────────────────────────────────────────────────── */}
      <div className="sticky bottom-4 bg-white border border-gray-200 rounded-xl p-4 flex items-center justify-between shadow-lg">
        <div className="text-sm text-gray-500">
          {saveStatus === 'saved' && <span className="text-green-600 font-medium">Settings saved.</span>}
          {saveStatus === 'error' && <span className="text-red-600 font-medium">Save failed. Try again.</span>}
          {saveStatus === 'idle' && <span>Unsaved changes will not appear on the site.</span>}
        </div>
        <button
          onClick={handleSave}
          disabled={saveStatus === 'saving'}
          className="px-6 py-2.5 text-sm font-semibold rounded-lg bg-brand-700 text-white hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {saveStatus === 'saving' ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}

// ── Field components ─────────────────────────────────────────────────────────

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
      />
    </div>
  );
}

function TextAreaField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent resize-none"
      />
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange,
  description,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  description: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <div className="flex items-center gap-3">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-10 h-10 rounded-lg border border-gray-300 cursor-pointer p-0.5"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 font-mono focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
          maxLength={7}
          pattern="^#[0-9a-fA-F]{6}$"
        />
      </div>
      <p className="text-xs text-gray-400 mt-1">{description}</p>
    </div>
  );
}
