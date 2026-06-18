'use client';

import type { JSX } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import type { ScoreConflict } from '@baseball/shared';
import { conflictKey } from '@baseball/shared';
import { resolveReconciliationConflictAction } from './actions';

export interface ReconciliationOverride {
  /** Stable conflict identity (see conflictKey in @baseball/shared). */
  key: string;
  useAwayValue: boolean;
}

interface ReconciliationPanelProps {
  reconciliationId: string;
  conflicts: ScoreConflict[];
  overrides: ReconciliationOverride[];
  /** True when the viewer is the home (canonical) team's coach. */
  canOverride: boolean;
  homeTeamLabel: string;
  awayTeamLabel: string;
}

const HALF_LABEL: Record<'top' | 'bottom', string> = { top: 'Top', bottom: 'Bottom' };

/** Human-readable label for a single score conflict, shown as the row title. */
function describeConflict(c: ScoreConflict): string {
  switch (c.kind) {
    case 'final_score':
      return `Final score — ${c.side === 'home' ? 'home' : 'away'} runs`;
    case 'inning_runs':
      return `Runs in ${HALF_LABEL[c.half]} ${c.inning}`;
    case 'team_hits':
      return `Team hits — ${c.side}`;
    case 'team_errors':
      return `Team errors — ${c.side}`;
    case 'player_batting':
      return `Batting · ${c.stat} (player ${c.playerId.slice(0, 8)})`;
    case 'player_pitching':
      return `Pitching · ${c.stat} (player ${c.playerId.slice(0, 8)})`;
    default:
      return 'Conflict';
  }
}

/** Render a numeric stat value, or an em dash when the player is absent from a log. */
function fmt(v: number | null): string {
  return v === null ? '—' : String(v);
}

/** Submit button that reflects the form action's pending state. */
function SubmitButton({ label }: { label: string }): JSX.Element {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="text-xs font-medium px-2.5 py-1 rounded-md border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-50"
    >
      {pending ? '…' : label}
    </button>
  );
}

/**
 * One conflict row: the home/away values side by side, which value is currently
 * in effect, and (for the home coach) a button to accept the away value or revert.
 */
function ConflictRow({
  reconciliationId,
  conflict,
  overridden,
  canOverride,
  homeTeamLabel,
  awayTeamLabel,
}: {
  reconciliationId: string;
  conflict: ScoreConflict;
  overridden: boolean;
  canOverride: boolean;
  homeTeamLabel: string;
  awayTeamLabel: string;
}): JSX.Element {
  const [error, formAction] = useFormState(resolveReconciliationConflictAction, null);
  const acceptedValue = overridden ? conflict.awayLog : conflict.homeLog;

  return (
    <div className="py-3 border-b border-gray-100 last:border-0">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-gray-700">{describeConflict(conflict)}</span>
        <span className="text-xs text-gray-400">
          Using {overridden ? awayTeamLabel : homeTeamLabel}:{' '}
          <span className="font-semibold text-gray-700">{fmt(acceptedValue)}</span>
        </span>
      </div>
      <div className="flex items-center gap-4 mt-1.5">
        <span
          className={`text-sm ${overridden ? 'text-gray-400' : 'font-semibold text-emerald-700'}`}
        >
          {homeTeamLabel} (home): {fmt(conflict.homeLog)}
        </span>
        <span className={`text-sm ${overridden ? 'font-semibold text-emerald-700' : 'text-gray-400'}`}>
          {awayTeamLabel}: {fmt(conflict.awayLog)}
        </span>
      </div>
      {canOverride && (
        <form action={formAction} className="mt-2 flex items-center gap-2">
          <input type="hidden" name="reconciliationId" value={reconciliationId} />
          <input type="hidden" name="conflictKey" value={conflictKey(conflict)} />
          <input type="hidden" name="useAwayValue" value={overridden ? 'false' : 'true'} />
          <SubmitButton label={overridden ? `Revert to ${homeTeamLabel}` : `Use ${awayTeamLabel} value`} />
          {error && <span className="text-xs text-red-600">{error}</span>}
        </form>
      )}
    </div>
  );
}

/**
 * Completed-game panel comparing the two scorekeepers' logs. Shows a green
 * agreement state when there are no conflicts, otherwise lists each conflict
 * with the home (canonical) and away values; the home coach can override.
 */
export function ReconciliationPanel({
  reconciliationId,
  conflicts,
  overrides,
  canOverride,
  homeTeamLabel,
  awayTeamLabel,
}: ReconciliationPanelProps): JSX.Element {
  const overriddenSet = new Set(overrides.filter((o) => o.useAwayValue).map((o) => o.key));

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-semibold text-gray-900">Scorekeeper Reconciliation</h2>
        <span className="text-xs text-gray-400">{homeTeamLabel} log is canonical</span>
      </div>

      {conflicts.length === 0 ? (
        <p className="text-sm text-emerald-700 mt-2">
          ✓ Both scorekeepers agree on every tracked value.
        </p>
      ) : (
        <>
          <p className="text-xs text-gray-500 mb-3">
            {conflicts.length} difference{conflicts.length === 1 ? '' : 's'} between the two logs.
            The home value stands unless {canOverride ? 'you accept' : 'the home coach accepts'} the
            away value.
          </p>
          <div>
            {conflicts.map((c, i) => {
              const k = conflictKey(c);
              return (
                <ConflictRow
                  key={k || i}
                  reconciliationId={reconciliationId}
                  conflict={c}
                  overridden={overriddenSet.has(k)}
                  canOverride={canOverride}
                  homeTeamLabel={homeTeamLabel}
                  awayTeamLabel={awayTeamLabel}
                />
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
