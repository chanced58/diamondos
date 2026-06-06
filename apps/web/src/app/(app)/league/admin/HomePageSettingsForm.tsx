'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  mergeWithThemeDefaults,
  leagueLeaderConfigSchema,
  DEFAULT_LEADER_CONFIG,
  ALL_SECTIONS,
  LEAGUE_COLOR_SCHEMES,
  type LeagueHomeTheme,
  type LeagueLeaderConfig,
} from '@baseball/shared';
import { CustomCategoriesEditor } from './CustomCategoriesEditor';

interface Props {
  leagueId: string;
  canEdit: boolean;
  initialVisibility: 'public' | 'signed_in';
  initialSlug: string;
  initialTheme: unknown;
  initialLeaderConfig: unknown;
}

export function HomePageSettingsForm({
  leagueId,
  canEdit,
  initialVisibility,
  initialSlug,
  initialTheme,
  initialLeaderConfig,
}: Props): JSX.Element {
  const router = useRouter();
  const [visibility, setVisibility] = useState<'public' | 'signed_in'>(initialVisibility);
  const [slug, setSlug] = useState(initialSlug);
  const [theme, setTheme] = useState<LeagueHomeTheme>(() => mergeWithThemeDefaults(initialTheme));
  const [leaderConfig, setLeaderConfig] = useState<LeagueLeaderConfig>(() => {
    const parsed = leagueLeaderConfigSchema.safeParse(initialLeaderConfig ?? {});
    return parsed.success ? parsed.data : DEFAULT_LEADER_CONFIG;
  });
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!canEdit) return;
    setSaving(true);
    setErrorMsg(null);
    setSavedAt(null);
    try {
      const res = await fetch('/api/league/home-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leagueId, visibility, slug, homeTheme: theme, leaderConfig }),
      });
      const data: { error?: string } = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorMsg(data.error ?? `Save failed (${res.status})`);
        return;
      }
      setSavedAt(new Date().toLocaleTimeString());
      router.refresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  function setSection(id: string, enabled: boolean) {
    setTheme((t) => ({ ...t, sections: t.sections.map((s) => (s.id === id ? { ...s, enabled } : s)) }));
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <fieldset className="space-y-2">
        <legend className="font-semibold">Visibility</legend>
        <label className="mr-4">
          <input type="radio" checked={visibility === 'public'} onChange={() => setVisibility('public')} disabled={!canEdit} /> Public
        </label>
        <label>
          <input type="radio" checked={visibility === 'signed_in'} onChange={() => setVisibility('signed_in')} disabled={!canEdit} /> Signed In Users Only
        </label>
      </fieldset>

      <label className="block">
        Public URL slug
        <span className="flex items-center gap-1">
          <span className="text-slate-400">/l/</span>
          <input className="rounded border px-2 py-1" value={slug} onChange={(e) => setSlug(e.target.value)} disabled={!canEdit} />
        </span>
      </label>

      <fieldset className="space-y-2">
        <legend className="font-semibold">Color scheme</legend>
        <p className="text-sm text-slate-500">
          Applies to your public league page and the coach dashboard. Light/dark follows each visitor&apos;s own setting.
        </p>
        <div className="flex flex-wrap gap-2">
          {LEAGUE_COLOR_SCHEMES.map((s) => {
            const selected = theme.colorScheme === s.key;
            return (
              <label
                key={s.key}
                className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                  selected ? 'border-slate-900 ring-1 ring-slate-900' : 'border-slate-300'
                } ${canEdit ? '' : 'cursor-not-allowed opacity-50'}`}
              >
                <input
                  type="radio"
                  name="colorScheme"
                  className="sr-only"
                  checked={selected}
                  onChange={() => setTheme({ ...theme, colorScheme: s.key })}
                  disabled={!canEdit}
                />
                <span className="h-4 w-4 rounded-full border border-black/10" style={{ backgroundColor: s.swatch }} />
                {s.label}
              </label>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="font-semibold">Hero & banner</legend>
        <input
          className="block w-full rounded border px-2 py-1"
          placeholder="Banner image URL"
          value={theme.bannerUrl ?? ''}
          onChange={(e) => setTheme({ ...theme, bannerUrl: e.target.value || null })}
          disabled={!canEdit}
        />
        <input
          className="block w-full rounded border px-2 py-1"
          placeholder="Hero title"
          value={theme.heroTitle}
          onChange={(e) => setTheme({ ...theme, heroTitle: e.target.value })}
          disabled={!canEdit}
        />
        <input
          className="block w-full rounded border px-2 py-1"
          placeholder="Hero tagline"
          value={theme.heroTagline}
          onChange={(e) => setTheme({ ...theme, heroTagline: e.target.value })}
          disabled={!canEdit}
        />
      </fieldset>

      <fieldset className="space-y-1">
        <legend className="font-semibold">Sections</legend>
        {ALL_SECTIONS.map((id) => (
          <label key={id} className="mr-4 inline-block">
            <input
              type="checkbox"
              checked={theme.sections.find((s) => s.id === id)?.enabled ?? true}
              onChange={(e) => setSection(id, e.target.checked)}
              disabled={!canEdit}
            />{' '}
            {id}
          </label>
        ))}
      </fieldset>

      <fieldset>
        <legend className="font-semibold">Custom leader categories</legend>
        <CustomCategoriesEditor value={leaderConfig} onChange={setLeaderConfig} disabled={!canEdit} />
      </fieldset>

      {errorMsg ? <p className="text-red-600">{errorMsg}</p> : null}
      {savedAt ? <p className="text-green-600">Saved at {savedAt}</p> : null}
      <button
        type="submit"
        disabled={!canEdit || saving}
        className="rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-40"
      >
        {saving ? 'Saving…' : 'Save home page settings'}
      </button>
    </form>
  );
}
