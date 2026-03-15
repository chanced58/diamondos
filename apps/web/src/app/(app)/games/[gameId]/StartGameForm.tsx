'use client';
import type { JSX } from 'react';

import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { startGameAction } from './actions';

function Toggle({
  id,
  checked,
  onChange,
  label,
  description,
}: {
  id: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <label htmlFor={id} className="flex items-center justify-between gap-4 cursor-pointer">
      <div>
        <p className="text-sm font-medium text-gray-900">{label}</p>
        {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-1 ${
          checked ? 'bg-brand-600' : 'bg-gray-200'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
            checked ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </label>
  );
}

function ConfirmButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full bg-brand-700 text-white font-semibold py-2.5 rounded-lg hover:bg-brand-800 disabled:opacity-50 transition-colors"
    >
      {pending ? 'Starting…' : 'Confirm & Start Game'}
    </button>
  );
}

export function StartGameForm({ gameId }: { gameId: string }): JSX.Element | null {
  const [configOpen, setConfigOpen] = useState(false);
  const [pitchTypeEnabled, setPitchTypeEnabled] = useState(true);
  const [pitchLocationEnabled, setPitchLocationEnabled] = useState(true);
  const [sprayChartEnabled, setSprayChartEnabled] = useState(true);
  const [error, formAction] = useFormState(startGameAction, null);

  if (!configOpen) {
    return (
      <button
        onClick={() => setConfigOpen(true)}
        className="text-sm bg-brand-700 text-white hover:bg-brand-800 px-4 py-2 rounded-lg font-medium transition-colors"
      >
        Start Game →
      </button>
    );
  }

  return (
    <div className="border border-brand-200 bg-brand-50 rounded-xl p-5 space-y-4 mt-3">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">Scoring options</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          Choose which features the scorekeeper will track. These can be changed during the game.
        </p>
      </div>

      <div className="space-y-4">
        <Toggle
          id="toggle-pitch-type"
          checked={pitchTypeEnabled}
          onChange={setPitchTypeEnabled}
          label="Track pitch type"
          description="Record FB, CB, SL, CH and other pitch types"
        />
        <div className="border-t border-brand-200" />
        <Toggle
          id="toggle-pitch-location"
          checked={pitchLocationEnabled}
          onChange={setPitchLocationEnabled}
          label="Track pitch location"
          description="Show the 5×5 strike zone grid for each pitch"
        />
        <div className="border-t border-brand-200" />
        <Toggle
          id="toggle-spray-chart"
          checked={sprayChartEnabled}
          onChange={setSprayChartEnabled}
          label="Batter spray chart"
          description="Display season hit-location tendencies per batter"
        />
      </div>

      {(!pitchTypeEnabled || !pitchLocationEnabled) && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          With pitch type or location disabled, pitch outcome buttons will always be enabled.
        </p>
      )}

      <form action={formAction} className="space-y-3">
        <input type="hidden" name="gameId" value={gameId} />
        <input type="hidden" name="pitchTypeEnabled" value={String(pitchTypeEnabled)} />
        <input type="hidden" name="pitchLocationEnabled" value={String(pitchLocationEnabled)} />
        <input type="hidden" name="sprayChartEnabled" value={String(sprayChartEnabled)} />
        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </p>
        )}
        <ConfirmButton />
      </form>

      <button
        onClick={() => setConfigOpen(false)}
        className="w-full text-sm text-gray-500 hover:text-gray-700 text-center"
      >
        Cancel
      </button>
    </div>
  );
}
