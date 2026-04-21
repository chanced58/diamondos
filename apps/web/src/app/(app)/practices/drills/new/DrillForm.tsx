'use client';

import type { JSX } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import {
  AGE_LEVEL_LABELS,
  EQUIPMENT_LABELS,
  FIELD_SPACE_LABELS,
  PracticeAgeLevel,
  PracticeDrill,
  PracticeEquipment,
  PracticeFieldSpace,
  PracticeSkillCategory,
  SKILL_CATEGORY_LABELS,
} from '@baseball/shared';
import { createDrillAction } from './actions';
import { updateDrillAction, deleteDrillAction } from '../[drillId]/edit/actions';

type Mode = 'create' | 'edit';

interface Props {
  teamId: string;
  mode: Mode;
  drill?: PracticeDrill;
}

const POSITION_OPTIONS = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'];

export function DrillForm({ teamId, mode, drill }: Props): JSX.Element {
  const action = mode === 'create' ? createDrillAction : updateDrillAction;
  const [error, formAction] = useFormState(action, null);

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="teamId" value={teamId} />
      {drill && <input type="hidden" name="id" value={drill.id} />}

      <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
          <input
            required
            name="name"
            defaultValue={drill?.name ?? ''}
            maxLength={120}
            className="w-full border border-gray-300 rounded-lg px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Description
          </label>
          <textarea
            name="description"
            defaultValue={drill?.description ?? ''}
            rows={3}
            className="w-full border border-gray-300 rounded-lg px-3 py-2"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Default duration (min)
            </label>
            <input
              type="number"
              name="defaultDurationMinutes"
              min={1}
              max={240}
              defaultValue={drill?.defaultDurationMinutes ?? ''}
              className="w-full border border-gray-300 rounded-lg px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Min players
            </label>
            <input
              type="number"
              name="minPlayers"
              min={1}
              defaultValue={drill?.minPlayers ?? ''}
              className="w-full border border-gray-300 rounded-lg px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Max players
            </label>
            <input
              type="number"
              name="maxPlayers"
              min={1}
              defaultValue={drill?.maxPlayers ?? ''}
              className="w-full border border-gray-300 rounded-lg px-3 py-2"
            />
          </div>
        </div>
      </section>

      <MultiCheckbox
        legend="Skill categories (required)"
        name="skillCategories"
        options={Object.values(PracticeSkillCategory).map((v) => ({
          value: v,
          label: SKILL_CATEGORY_LABELS[v],
        }))}
        defaultChecked={drill?.skillCategories}
      />

      <MultiCheckbox
        legend="Age levels"
        name="ageLevels"
        options={Object.values(PracticeAgeLevel).map((v) => ({
          value: v,
          label: AGE_LEVEL_LABELS[v],
        }))}
        defaultChecked={drill?.ageLevels ?? [PracticeAgeLevel.ALL]}
      />

      <MultiCheckbox
        legend="Positions (leave empty for any)"
        name="positions"
        options={POSITION_OPTIONS.map((p) => ({ value: p, label: p }))}
        defaultChecked={drill?.positions}
        columns={5}
      />

      <MultiCheckbox
        legend="Equipment"
        name="equipment"
        options={Object.values(PracticeEquipment).map((v) => ({
          value: v,
          label: EQUIPMENT_LABELS[v],
        }))}
        defaultChecked={drill?.equipment}
      />

      <MultiCheckbox
        legend="Field spaces"
        name="fieldSpaces"
        options={Object.values(PracticeFieldSpace).map((v) => ({
          value: v,
          label: FIELD_SPACE_LABELS[v],
        }))}
        defaultChecked={drill?.fieldSpaces}
      />

      <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Coaching points
          </label>
          <textarea
            name="coachingPoints"
            defaultValue={drill?.coachingPoints ?? ''}
            rows={4}
            placeholder="One point per line. Shown on the printable coach card."
            className="w-full border border-gray-300 rounded-lg px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Tags (comma-separated)
          </label>
          <input
            name="tags"
            defaultValue={drill?.tags?.join(', ') ?? ''}
            placeholder="fundamentals, warmup, rainy-day"
            className="w-full border border-gray-300 rounded-lg px-3 py-2"
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Diagram URL
            </label>
            <input
              type="url"
              name="diagramUrl"
              defaultValue={drill?.diagramUrl ?? ''}
              placeholder="https://..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Video URL
            </label>
            <input
              type="url"
              name="videoUrl"
              defaultValue={drill?.videoUrl ?? ''}
              placeholder="https://youtube.com/..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2"
            />
          </div>
        </div>
      </section>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between">
        <SubmitButton mode={mode} />
        {mode === 'edit' && drill && (
          <DeleteDrillButton drillId={drill.id} teamId={teamId} />
        )}
      </div>
    </form>
  );
}

function SubmitButton({ mode }: { mode: Mode }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-brand-700 text-white font-semibold px-5 py-2.5 rounded-lg hover:bg-brand-800 disabled:opacity-60"
    >
      {pending
        ? mode === 'create'
          ? 'Saving…'
          : 'Updating…'
        : mode === 'create'
          ? 'Save drill'
          : 'Update drill'}
    </button>
  );
}

interface MultiCheckboxProps {
  legend: string;
  name: string;
  options: Array<{ value: string; label: string }>;
  defaultChecked?: readonly string[];
  columns?: number;
}

function MultiCheckbox({ legend, name, options, defaultChecked, columns = 3 }: MultiCheckboxProps) {
  const checked = new Set(defaultChecked ?? []);
  return (
    <fieldset className="bg-white rounded-xl border border-gray-200 p-5">
      <legend className="text-sm font-semibold text-gray-900 px-1">{legend}</legend>
      <div
        className="grid gap-y-1 mt-2"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {options.map((opt) => (
          <label
            key={opt.value}
            className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer"
          >
            <input
              type="checkbox"
              name={name}
              value={opt.value}
              defaultChecked={checked.has(opt.value)}
              className="rounded border-gray-300 text-brand-700 focus:ring-brand-500"
            />
            {opt.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function DeleteDrillButton({ drillId, teamId }: { drillId: string; teamId: string }) {
  return (
    <form
      action={deleteDrillAction}
      onSubmit={(e) => {
        if (!confirm('Delete this drill? This cannot be undone.')) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={drillId} />
      <input type="hidden" name="teamId" value={teamId} />
      <button
        type="submit"
        className="text-sm text-red-600 hover:text-red-700 hover:underline font-medium"
      >
        Delete drill
      </button>
    </form>
  );
}
