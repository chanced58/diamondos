'use client';
import type { JSX } from 'react';
import { useState, useTransition } from 'react';
import { updateProfileAction } from './actions';
import type { PlayerProfile } from '@baseball/shared';

interface Props {
  profile: PlayerProfile | null;
}

export function ProfileEditor({ profile }: Props): JSX.Element {
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    setSaved(false);
    startTransition(() => {
      updateProfileAction(formData).then((result) => {
        if ('error' in result) setError(result.error);
        else setSaved(true);
      });
    });
  }

  return (
    <form
      action={handleSubmit}
      className="bg-white border border-gray-200 rounded-xl p-6 space-y-5"
    >
      <h2 className="text-base font-semibold text-gray-900">Profile</h2>

      <Field label="Handle (public URL)" name="handle" defaultValue={profile?.handle} prefix="/p/" />
      <Field
        label="Headline"
        name="headline"
        defaultValue={profile?.headline ?? ''}
        placeholder="SS · 2027 · Diamond Prep HS"
      />
      <Textarea
        label="Bio"
        name="bio"
        defaultValue={profile?.bio ?? ''}
        placeholder="Tell college coaches about yourself — your game, your mindset, what you bring to a team."
        rows={4}
      />

      <div className="grid grid-cols-2 gap-3">
        <Field label="Height (in)" name="heightInches" type="number" defaultValue={profile?.heightInches ?? ''} />
        <Field label="Weight (lbs)" name="weightLbs" type="number" defaultValue={profile?.weightLbs ?? ''} />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Field label="GPA" name="gpa" type="number" step="0.01" defaultValue={profile?.gpa ?? ''} />
        <Field label="SAT" name="satScore" type="number" defaultValue={profile?.satScore ?? ''} />
        <Field label="ACT" name="actScore" type="number" defaultValue={profile?.actScore ?? ''} />
      </div>

      <Textarea
        label="Target majors (one per line)"
        name="targetMajors"
        defaultValue={(profile?.targetMajors ?? []).join('\n')}
        placeholder={'Business\nKinesiology'}
        rows={3}
      />

      <div className="pt-2 border-t border-gray-100">
        <p className="text-xs font-semibold uppercase text-gray-500 mb-3">Showcase measurables</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="60-yard (sec)" name="sixtyYardDashSeconds" type="number" step="0.01" defaultValue={profile?.sixtyYardDashSeconds ?? ''} />
          <Field label="Exit velo (mph)" name="exitVelocityMph" type="number" defaultValue={profile?.exitVelocityMph ?? ''} />
          <Field label="Pitch velo (mph)" name="pitchVelocityMph" type="number" defaultValue={profile?.pitchVelocityMph ?? ''} />
          <Field label="Pop time (sec)" name="popTimeSeconds" type="number" step="0.01" defaultValue={profile?.popTimeSeconds ?? ''} />
        </div>
      </div>

      <Textarea
        label="Achievements (one per line)"
        name="achievements"
        defaultValue={(profile?.achievements ?? []).join('\n')}
        placeholder={'All-conference 2024\nTeam captain\nHigh-school home run record'}
        rows={5}
      />

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}
      {saved && !error && (
        <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
          Saved.
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="bg-brand-700 text-white font-semibold py-2 px-5 rounded-lg hover:bg-brand-800 disabled:opacity-50"
      >
        {isPending ? 'Saving…' : 'Save profile'}
      </button>
    </form>
  );
}

function Field({
  label,
  name,
  defaultValue,
  type = 'text',
  step,
  placeholder,
  prefix,
}: {
  label: string;
  name: string;
  defaultValue?: string | number | null;
  type?: string;
  step?: string;
  placeholder?: string;
  prefix?: string;
}): JSX.Element {
  const value = defaultValue === null || defaultValue === undefined ? '' : String(defaultValue);
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {prefix ? (
        <div className="flex">
          <span className="inline-flex items-center px-3 text-sm text-gray-500 bg-gray-50 border border-r-0 border-gray-300 rounded-l-lg">
            {prefix}
          </span>
          <input
            name={name}
            type={type}
            step={step}
            defaultValue={value}
            placeholder={placeholder}
            className="flex-1 border border-gray-300 rounded-r-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
      ) : (
        <input
          name={name}
          type={type}
          step={step}
          defaultValue={value}
          placeholder={placeholder}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      )}
    </div>
  );
}

function Textarea({
  label,
  name,
  defaultValue,
  placeholder,
  rows = 3,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  placeholder?: string;
  rows?: number;
}): JSX.Element {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <textarea
        name={name}
        rows={rows}
        defaultValue={defaultValue ?? ''}
        placeholder={placeholder}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
      />
    </div>
  );
}
