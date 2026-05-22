'use client';

import type { JSX } from 'react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  defaultLeagueScoringSettings,
  mergeWithDefaults,
  MAX_BATTERS_CAP,
  MIN_BATTERS_CAP,
  MIN_INNINGS,
  MAX_INNINGS_CAP,
  type LeagueScoringSettings,
} from '@baseball/shared';

interface LeagueScoringSettingsFormProps {
  leagueId: string;
  initialSettings: unknown;
  canEdit: boolean;
  pitchRuleOptions?: Array<{ id: string; label: string }>;
}

export function LeagueScoringSettingsForm({
  leagueId,
  initialSettings,
  canEdit,
  pitchRuleOptions = [],
}: LeagueScoringSettingsFormProps): JSX.Element {
  const router = useRouter();
  const [settings, setSettings] = useState<LeagueScoringSettings>(() =>
    mergeWithDefaults(initialSettings),
  );
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
      const res = await fetch('/api/league/scoring-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leagueId, settings }),
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

  function handleReset() {
    setSettings(defaultLeagueScoringSettings());
    setSavedAt(null);
    setErrorMsg(null);
  }

  return (
    <form
      onSubmit={handleSave}
      aria-label="League scoring settings"
      className="bg-white rounded-xl border border-gray-200 overflow-hidden"
    >
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-gray-900">League Scoring Settings</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            League-wide feature flags. Applies to every team in this league.
          </p>
        </div>
        {!canEdit && (
          <span className="text-xs text-gray-400">Read-only (admin role required)</span>
        )}
      </div>

      <fieldset disabled={!canEdit} className="p-6 space-y-8">
        {errorMsg && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
            {errorMsg}
          </div>
        )}

        <Section
          title="Lineup & Batting"
          description="Controls how batting orders are built and extended during a game."
        >
          <Toggle
            label="Allow expanded lineups (>9 batters)"
            checked={settings.lineup.allowExpanded}
            onChange={(v) =>
              setSettings({ ...settings, lineup: { ...settings.lineup, allowExpanded: v } })
            }
          />
          <NumberField
            label="Maximum batters per lineup"
            min={MIN_BATTERS_CAP}
            max={MAX_BATTERS_CAP}
            value={settings.lineup.maxBatters}
            disabled={!settings.lineup.allowExpanded}
            onChange={(v) =>
              setSettings({ ...settings, lineup: { ...settings.lineup, maxBatters: v } })
            }
          />
          <Toggle
            label="Allow mid-game lineup extensions (Add Batter)"
            checked={settings.lineup.allowMidGameExtension}
            disabled={!settings.lineup.allowExpanded}
            onChange={(v) =>
              setSettings({
                ...settings,
                lineup: { ...settings.lineup, allowMidGameExtension: v },
              })
            }
          />
          <Toggle
            label="Continuous batting order (every rostered player bats)"
            checked={settings.lineup.continuousBattingOrder}
            onChange={(v) =>
              setSettings({
                ...settings,
                lineup: { ...settings.lineup, continuousBattingOrder: v },
              })
            }
          />
        </Section>

        <Section
          title="Game Length"
          description="Innings, mercy rule, per-half run cap, and ghost-runner tiebreakers."
        >
          <NumberField
            label="Regulation innings"
            min={MIN_INNINGS}
            max={MAX_INNINGS_CAP}
            value={settings.gameLength.maxInnings}
            onChange={(v) =>
              setSettings({
                ...settings,
                gameLength: { ...settings.gameLength, maxInnings: v },
              })
            }
          />

          <Toggle
            label="Mercy rule"
            checked={settings.gameLength.mercy.enabled}
            onChange={(v) =>
              setSettings({
                ...settings,
                gameLength: {
                  ...settings.gameLength,
                  mercy: { ...settings.gameLength.mercy, enabled: v },
                },
              })
            }
          />
          <div className="grid grid-cols-2 gap-3 pl-6">
            <NumberField
              label="Run differential"
              min={1}
              max={30}
              value={settings.gameLength.mercy.runDiff}
              disabled={!settings.gameLength.mercy.enabled}
              onChange={(v) =>
                setSettings({
                  ...settings,
                  gameLength: {
                    ...settings.gameLength,
                    mercy: { ...settings.gameLength.mercy, runDiff: v },
                  },
                })
              }
            />
            <NumberField
              label="After completed inning"
              min={1}
              max={MAX_INNINGS_CAP}
              value={settings.gameLength.mercy.afterInning}
              disabled={!settings.gameLength.mercy.enabled}
              onChange={(v) =>
                setSettings({
                  ...settings,
                  gameLength: {
                    ...settings.gameLength,
                    mercy: { ...settings.gameLength.mercy, afterInning: v },
                  },
                })
              }
            />
          </div>

          <Toggle
            label="Max runs per half-inning"
            checked={settings.gameLength.runCap.enabled}
            onChange={(v) =>
              setSettings({
                ...settings,
                gameLength: {
                  ...settings.gameLength,
                  runCap: { ...settings.gameLength.runCap, enabled: v },
                },
              })
            }
          />
          <div className="pl-6">
            <NumberField
              label="Run cap"
              min={1}
              max={30}
              value={settings.gameLength.runCap.value}
              disabled={!settings.gameLength.runCap.enabled}
              onChange={(v) =>
                setSettings({
                  ...settings,
                  gameLength: {
                    ...settings.gameLength,
                    runCap: { ...settings.gameLength.runCap, value: v },
                  },
                })
              }
            />
          </div>

          <Toggle
            label="Ghost-runner tiebreaker in extras"
            checked={settings.gameLength.tiebreakerExtras.enabled}
            onChange={(v) =>
              setSettings({
                ...settings,
                gameLength: {
                  ...settings.gameLength,
                  tiebreakerExtras: { ...settings.gameLength.tiebreakerExtras, enabled: v },
                },
              })
            }
          />
          <div className="grid grid-cols-2 gap-3 pl-6">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Starting base
              </label>
              <select
                value={settings.gameLength.tiebreakerExtras.startBase}
                disabled={!settings.gameLength.tiebreakerExtras.enabled}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    gameLength: {
                      ...settings.gameLength,
                      tiebreakerExtras: {
                        ...settings.gameLength.tiebreakerExtras,
                        startBase: Number(e.target.value) as 1 | 2 | 3,
                      },
                    },
                  })
                }
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-gray-50 disabled:text-gray-400"
              >
                <option value={1}>1st</option>
                <option value={2}>2nd</option>
                <option value={3}>3rd</option>
              </select>
            </div>
            <NumberField
              label="Starts at inning"
              min={1}
              max={MAX_INNINGS_CAP}
              value={settings.gameLength.tiebreakerExtras.fromInning}
              disabled={!settings.gameLength.tiebreakerExtras.enabled}
              onChange={(v) =>
                setSettings({
                  ...settings,
                  gameLength: {
                    ...settings.gameLength,
                    tiebreakerExtras: {
                      ...settings.gameLength.tiebreakerExtras,
                      fromInning: v,
                    },
                  },
                })
              }
            />
          </div>
        </Section>

        <Section
          title="Guest Players"
          description="Allow non-roster players (ad-hoc or from another team) to appear in a lineup."
        >
          <Toggle
            label="Allow guest players in lineups"
            checked={settings.guests.allowed}
            onChange={(v) =>
              setSettings({ ...settings, guests: { ...settings.guests, allowed: v } })
            }
          />
          <Toggle
            label="Count guest appearances toward stats by default"
            checked={settings.guests.countTowardStatsDefault}
            disabled={!settings.guests.allowed}
            onChange={(v) =>
              setSettings({
                ...settings,
                guests: { ...settings.guests, countTowardStatsDefault: v },
              })
            }
          />
        </Section>

        <Section
          title="Substitutions"
          description="Non-standard substitution rules that affect the in-game menu."
        >
          <Toggle
            label="Courtesy runner for catcher and pitcher"
            checked={settings.substitutions.courtesyRunnerForCatcherPitcher}
            onChange={(v) =>
              setSettings({
                ...settings,
                substitutions: { courtesyRunnerForCatcherPitcher: v },
              })
            }
          />
        </Section>

        <Section
          title="Game Rules"
          description="Rule clarifications that affect how the scoring engine resolves plays."
        >
          <Toggle
            label="Dropped third strike (batter can run on uncaught K3)"
            checked={settings.rules.droppedThirdStrike}
            onChange={(v) =>
              setSettings({ ...settings, rules: { droppedThirdStrike: v } })
            }
          />
        </Section>

        <Section
          title="Pitch-Count Compliance"
          description="Default pitch-count ruleset for new seasons in this league. Teams may still override per-season."
        >
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Default ruleset
            </label>
            <select
              value={settings.compliance.defaultPitchRuleId ?? ''}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  compliance: { defaultPitchRuleId: e.target.value || null },
                })
              }
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="">No default (teams choose)</option>
              {pitchRuleOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </Section>

        {canEdit && (
          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="text-sm font-medium bg-brand-700 text-white px-4 py-2 rounded-lg hover:bg-brand-800 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving…' : 'Save Settings'}
            </button>
            <button
              type="button"
              onClick={handleReset}
              disabled={saving}
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              Reset to defaults
            </button>
            {savedAt && (
              <span className="text-xs text-emerald-700">Saved at {savedAt}</span>
            )}
          </div>
        )}
      </fieldset>
    </form>
  );
}

interface SectionProps {
  title: string;
  description?: string;
  children: React.ReactNode;
}

function Section({ title, description, children }: SectionProps): JSX.Element {
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

interface ToggleProps {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}

function Toggle({ label, checked, disabled, onChange }: ToggleProps): JSX.Element {
  return (
    <label
      className={`flex items-center gap-3 text-sm ${
        disabled ? 'text-gray-400' : 'text-gray-900 cursor-pointer'
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-gray-300 text-brand-700 focus:ring-brand-500 disabled:cursor-not-allowed"
      />
      <span>{label}</span>
    </label>
  );
}

interface NumberFieldProps {
  label: string;
  min: number;
  max: number;
  value: number;
  disabled?: boolean;
  onChange: (next: number) => void;
}

function NumberField({
  label,
  min,
  max,
  value,
  disabled,
  onChange,
}: NumberFieldProps): JSX.Element {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        disabled={disabled}
        onChange={(e) => {
          const parsed = Number(e.target.value);
          if (Number.isFinite(parsed)) onChange(parsed);
        }}
        className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-gray-50 disabled:text-gray-400"
      />
      <p className="text-xs text-gray-400 mt-1">
        Range: {min}–{max}
      </p>
    </div>
  );
}
