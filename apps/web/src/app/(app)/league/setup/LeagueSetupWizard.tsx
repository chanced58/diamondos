'use client';

import type { JSX } from 'react';
import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  LEAGUE_TYPES,
  LEAGUE_LEVELS,
  SEASON_NAMES,
  leagueSetupStep1Schema,
  leagueSetupStep2Schema,
} from '@baseball/shared';
import { completeLeagueSetupAction } from './actions';

interface Props {
  leagueId: string;
  initialName: string;
  initialStateCode: string;
}

export function LeagueSetupWizard({ leagueId, initialName, initialStateCode }: Props): JSX.Element {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1 state
  const [name, setName] = useState(initialName);
  const [leagueType, setLeagueType] = useState('');
  const [level, setLevel] = useState('');
  const [stateCode, setStateCode] = useState(initialStateCode);
  const [seasonName, setSeasonName] = useState('Spring');
  const [seasonYear, setSeasonYear] = useState(new Date().getFullYear());
  const [teamCount, setTeamCount] = useState(4);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  // Step 2 state
  const [teamNames, setTeamNames] = useState<string[]>([]);
  const [useDivisions, setUseDivisions] = useState(false);
  const [divisions, setDivisions] = useState<string[]>([]);
  const [teamDivisions, setTeamDivisions] = useState<Record<string, string>>({});

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoFile(file);
    const reader = new FileReader();
    reader.onload = () => setLogoPreview(reader.result as string);
    reader.readAsDataURL(file);
  }

  function handleStep1Next() {
    setError(null);
    const parsed = leagueSetupStep1Schema.safeParse({
      name,
      leagueType,
      level,
      stateCode: stateCode || undefined,
      seasonName,
      seasonYear,
      teamCount,
    });
    if (!parsed.success) {
      setError(parsed.error.errors[0]?.message ?? 'Please check your inputs.');
      return;
    }
    // Initialize team name inputs if count changed
    setTeamNames((prev) => {
      const arr = [...prev];
      while (arr.length < teamCount) arr.push('');
      return arr.slice(0, teamCount);
    });
    setStep(2);
  }

  function handleAddDivision() {
    setDivisions((prev) => [...prev, '']);
  }

  function handleRemoveDivision(idx: number) {
    setDivisions((prev) => prev.filter((_, i) => i !== idx));
    // Clear any team assignments to this division
    setTeamDivisions((prev) => {
      const next = { ...prev };
      for (const [k, v] of Object.entries(next)) {
        if (v === String(idx)) delete next[k];
      }
      return next;
    });
  }

  async function handleSubmit() {
    setError(null);
    const parsed = leagueSetupStep2Schema.safeParse({
      teamNames,
      divisions: useDivisions ? divisions : undefined,
      teamDivisions: useDivisions ? teamDivisions : undefined,
    });
    if (!parsed.success) {
      setError(parsed.error.errors[0]?.message ?? 'Please check your inputs.');
      return;
    }

    setSaving(true);
    try {
      // Upload logo if selected
      let logoUrl: string | undefined;
      if (logoFile) {
        const formData = new FormData();
        formData.append('file', logoFile);
        formData.append('leagueId', leagueId);
        const res = await fetch('/api/league/logo', { method: 'POST', body: formData });
        if (res.ok) {
          const data = await res.json();
          logoUrl = data.logo_url;
        }
      }

      const result = await completeLeagueSetupAction({
        leagueId,
        name,
        leagueType,
        level,
        stateCode: stateCode || null,
        currentSeason: `${seasonName} ${seasonYear}`,
        logoUrl: logoUrl ?? null,
        teamNames,
        divisions: useDivisions ? divisions.filter(Boolean) : [],
        teamDivisions: useDivisions ? teamDivisions : {},
      });

      if (result?.error) {
        setError(result.error);
        setSaving(false);
        return;
      }

      router.push('/league/admin');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setSaving(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
      {/* Step indicator */}
      <div className="flex border-b border-gray-200">
        <button
          type="button"
          className={`flex-1 py-3 text-sm font-medium text-center ${
            step === 1 ? 'text-brand-700 border-b-2 border-brand-700' : 'text-gray-400'
          }`}
          onClick={() => step === 2 && setStep(1)}
        >
          1. League Details
        </button>
        <button
          type="button"
          className={`flex-1 py-3 text-sm font-medium text-center ${
            step === 2 ? 'text-brand-700 border-b-2 border-brand-700' : 'text-gray-400'
          }`}
          disabled={step === 1}
        >
          2. Teams &amp; Divisions
        </button>
      </div>

      <div className="p-6 space-y-5">
        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {step === 1 && (
          <>
            {/* League Name */}
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                League Name <span className="text-red-500">*</span>
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                placeholder="e.g. Metro Youth Baseball League"
              />
            </div>

            {/* League Type */}
            <div>
              <label htmlFor="leagueType" className="block text-sm font-medium text-gray-700 mb-1">
                League Type <span className="text-red-500">*</span>
              </label>
              <select
                id="leagueType"
                value={leagueType}
                onChange={(e) => setLeagueType(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              >
                <option value="">Select type...</option>
                {LEAGUE_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>

            {/* Competitive Level */}
            <div>
              <label htmlFor="level" className="block text-sm font-medium text-gray-700 mb-1">
                Competitive Level <span className="text-red-500">*</span>
              </label>
              <select
                id="level"
                value={level}
                onChange={(e) => setLevel(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              >
                <option value="">Select level...</option>
                {LEAGUE_LEVELS.map((l) => (
                  <option key={l.value} value={l.value}>{l.label}</option>
                ))}
              </select>
            </div>

            {/* State Code */}
            <div>
              <label htmlFor="stateCode" className="block text-sm font-medium text-gray-700 mb-1">
                State
              </label>
              <input
                id="stateCode"
                type="text"
                value={stateCode}
                onChange={(e) => setStateCode(e.target.value.toUpperCase().slice(0, 2))}
                className="w-32 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                placeholder="TX"
                maxLength={2}
              />
            </div>

            {/* Starting Season */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Starting Season <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-3">
                <select
                  value={seasonName}
                  onChange={(e) => setSeasonName(e.target.value)}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                >
                  {SEASON_NAMES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                <input
                  type="number"
                  value={seasonYear}
                  onChange={(e) => setSeasonYear(Number(e.target.value))}
                  className="w-24 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                  min={2020}
                  max={2050}
                />
              </div>
            </div>

            {/* Number of Teams */}
            <div>
              <label htmlFor="teamCount" className="block text-sm font-medium text-gray-700 mb-1">
                Number of Teams <span className="text-red-500">*</span>
              </label>
              <input
                id="teamCount"
                type="number"
                value={teamCount}
                onChange={(e) => setTeamCount(Math.max(2, Math.min(64, Number(e.target.value))))}
                className="w-24 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                min={2}
                max={64}
              />
              <p className="text-xs text-gray-400 mt-1">Between 2 and 64 teams</p>
            </div>

            {/* League Logo */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                League Logo <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <div className="flex items-center gap-4">
                {logoPreview && (
                  <img
                    src={logoPreview}
                    alt="Logo preview"
                    className="h-14 w-14 rounded-lg object-contain border border-gray-200"
                  />
                )}
                <button
                  type="button"
                  onClick={() => logoInputRef.current?.click()}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  {logoPreview ? 'Change Logo' : 'Upload Logo'}
                </button>
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml,image/webp"
                  className="hidden"
                  onChange={handleLogoChange}
                />
              </div>
              <p className="text-xs text-gray-400 mt-1">PNG, JPEG, SVG, or WebP. Max 5 MB.</p>
            </div>

            <div className="pt-4 flex justify-end">
              <button
                type="button"
                onClick={handleStep1Next}
                className="rounded-lg bg-brand-700 px-6 py-2.5 text-sm font-medium text-white hover:bg-brand-800 transition-colors"
              >
                Next: Teams &amp; Divisions
              </button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            {/* Divisions toggle */}
            <div className="flex items-center gap-3">
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={useDivisions}
                  onChange={(e) => {
                    setUseDivisions(e.target.checked);
                    if (e.target.checked && divisions.length === 0) {
                      setDivisions(['']);
                    }
                  }}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-gray-200 rounded-full peer peer-checked:bg-brand-600 after:content-[''] after:absolute after:top-0.5 after:start-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full" />
              </label>
              <span className="text-sm font-medium text-gray-700">Use divisions</span>
            </div>

            {/* Division names */}
            {useDivisions && (
              <div className="space-y-3 pl-1">
                <p className="text-sm text-gray-500">Enter division names:</p>
                {divisions.map((div, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={div}
                      onChange={(e) => {
                        const next = [...divisions];
                        next[idx] = e.target.value;
                        setDivisions(next);
                      }}
                      className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                      placeholder={`Division ${idx + 1}`}
                    />
                    {divisions.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveDivision(idx)}
                        className="text-gray-400 hover:text-red-500 text-lg leading-none"
                        title="Remove division"
                      >
                        &times;
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={handleAddDivision}
                  className="text-sm text-brand-700 hover:text-brand-800 font-medium"
                >
                  + Add Division
                </button>
              </div>
            )}

            {/* Team names */}
            <div className="space-y-3">
              <p className="text-sm font-medium text-gray-700">
                Team Names <span className="text-gray-400 font-normal">({teamCount} teams)</span>
              </p>
              {teamNames.map((tn, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 w-6 text-right">{idx + 1}.</span>
                  <input
                    type="text"
                    value={tn}
                    onChange={(e) => {
                      const next = [...teamNames];
                      next[idx] = e.target.value;
                      setTeamNames(next);
                    }}
                    className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                    placeholder={`Team ${idx + 1}`}
                  />
                  {useDivisions && divisions.filter(Boolean).length > 0 && (
                    <select
                      value={teamDivisions[String(idx)] ?? ''}
                      onChange={(e) => {
                        setTeamDivisions((prev) => {
                          const next = { ...prev };
                          if (e.target.value) {
                            next[String(idx)] = e.target.value;
                          } else {
                            delete next[String(idx)];
                          }
                          return next;
                        });
                      }}
                      className="w-40 rounded-lg border border-gray-300 px-2 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                    >
                      <option value="">No division</option>
                      {divisions.filter(Boolean).map((d, di) => (
                        <option key={di} value={d}>{d}</option>
                      ))}
                    </select>
                  )}
                </div>
              ))}
            </div>

            <div className="pt-4 flex justify-between">
              <button
                type="button"
                onClick={() => { setStep(1); setError(null); }}
                className="rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={saving}
                className="rounded-lg bg-brand-700 px-6 py-2.5 text-sm font-medium text-white hover:bg-brand-800 transition-colors disabled:opacity-50"
              >
                {saving ? 'Setting up...' : 'Complete Setup'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
