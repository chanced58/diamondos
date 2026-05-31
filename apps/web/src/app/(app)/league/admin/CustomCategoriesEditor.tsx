'use client';
import { STAT_CATALOG, type LeagueLeaderConfig, type CustomCategory } from '@baseball/shared';

export function CustomCategoriesEditor({
  value,
  onChange,
  disabled,
}: {
  value: LeagueLeaderConfig;
  onChange: (next: LeagueLeaderConfig) => void;
  disabled?: boolean;
}): JSX.Element {
  const custom = value.custom;

  function update(next: CustomCategory[]) {
    onChange({ ...value, custom: next });
  }
  function add() {
    if (custom.length >= 5) return;
    update([...custom, { statKey: STAT_CATALOG[0].key, label: STAT_CATALOG[0].label, limit: 10 }]);
  }
  function remove(i: number) {
    update(custom.filter((_, idx) => idx !== i));
  }
  function edit(i: number, patch: Partial<CustomCategory>) {
    update(custom.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">Add up to 5 custom leader boards ({custom.length}/5).</p>
      {custom.map((c, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2">
          <select
            className="rounded border px-2 py-1"
            value={c.statKey}
            disabled={disabled}
            onChange={(e) => {
              const def = STAT_CATALOG.find((s) => s.key === e.target.value)!;
              edit(i, { statKey: def.key, label: c.label || def.label });
            }}
          >
            {STAT_CATALOG.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label} ({s.subject})
              </option>
            ))}
          </select>
          <input
            className="rounded border px-2 py-1"
            value={c.label}
            disabled={disabled}
            onChange={(e) => edit(i, { label: e.target.value })}
            placeholder="Display label"
          />
          <input
            className="w-20 rounded border px-2 py-1"
            type="number"
            min={3}
            max={25}
            value={c.limit}
            disabled={disabled}
            onChange={(e) => edit(i, { limit: Number(e.target.value) })}
          />
          <button type="button" className="text-red-600 disabled:opacity-40" disabled={disabled} onClick={() => remove(i)}>
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        disabled={disabled || custom.length >= 5}
        className="rounded bg-slate-900 px-3 py-1 text-white disabled:opacity-40"
        onClick={add}
      >
        Add category
      </button>
    </div>
  );
}
