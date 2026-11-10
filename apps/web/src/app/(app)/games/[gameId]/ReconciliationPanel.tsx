'use client';

import type { JSX } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import type { ConflictGroup, ConflictPlayerNames, ReconciliationOverride, ScoreConflict } from '@baseball/shared';
import {
  awayValueConflictKeys,
  conflictKey,
  conflictPlayerLabel,
  describeScoreConflict,
  groupConflictsForSettling,
  settledConflictKeys,
} from '@baseball/shared';
import { resolveReconciliationConflictAction } from './actions';

interface ReconciliationPanelProps {
  reconciliationId: string;
  conflicts: ScoreConflict[];
  overrides: ReconciliationOverride[];
  /** True when the viewer may settle the differences. */
  canOverride: boolean;
  homeTeamLabel: string;
  awayTeamLabel: string;
  /** Names of the conflicts' players, by player id. */
  playerNames?: ConflictPlayerNames;
}

/** Render a numeric stat value, or an em dash when the player is absent from a log. */
function fmt(v: number | null): string {
  return v === null ? '—' : String(v);
}

/** What a player conflict differs on, without the player (the group heading names them). */
function statLabel(conflict: ScoreConflict): string {
  if (conflict.kind === 'player_batting') return `Batting · ${conflict.stat}`;
  if (conflict.kind === 'player_pitching') return `Pitching · ${conflict.stat}`;
  return describeScoreConflict(conflict);
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

/** One value pair: the home and away values, with the one in effect highlighted. */
function ValuePair({
  conflict,
  overridden,
  homeTeamLabel,
  awayTeamLabel,
}: {
  conflict: ScoreConflict;
  overridden: boolean;
  homeTeamLabel: string;
  awayTeamLabel: string;
}): JSX.Element {
  return (
    <div className="flex items-center gap-4 mt-1.5">
      <span className={`text-sm ${overridden ? 'text-gray-400' : 'font-semibold text-emerald-700'}`}>
        {homeTeamLabel} (home): {fmt(conflict.homeLog)}
      </span>
      <span className={`text-sm ${overridden ? 'font-semibold text-emerald-700' : 'text-gray-400'}`}>
        {awayTeamLabel}: {fmt(conflict.awayLog)}
      </span>
    </div>
  );
}

/** A form that records one choice for a group: the away value, or the home value. */
function ChoiceForm({
  formAction,
  reconciliationId,
  groupKey,
  useAwayValue,
  label,
}: {
  formAction: (formData: FormData) => void;
  reconciliationId: string;
  groupKey: string;
  useAwayValue: boolean;
  label: string;
}): JSX.Element {
  return (
    <form action={formAction}>
      <input type="hidden" name="reconciliationId" value={reconciliationId} />
      <input type="hidden" name="conflictKey" value={groupKey} />
      <input type="hidden" name="useAwayValue" value={useAwayValue ? 'true' : 'false'} />
      <SubmitButton label={label} />
    </form>
  );
}

/**
 * One choice: a line-score conflict, or every difference for one player. A
 * player is settled as a whole — the result takes their whole line from one
 * book. Keeping the home value is a decision too: an undecided group offers
 * both, a decided one offers the other side.
 */
function ConflictGroupRow({
  reconciliationId,
  group,
  overridden,
  decided,
  canOverride,
  homeTeamLabel,
  awayTeamLabel,
  playerNames,
}: {
  reconciliationId: string;
  group: ConflictGroup;
  overridden: boolean;
  decided: boolean;
  canOverride: boolean;
  homeTeamLabel: string;
  awayTeamLabel: string;
  playerNames?: ConflictPlayerNames;
}): JSX.Element {
  const [error, formAction] = useFormState(resolveReconciliationConflictAction, null);
  const using = overridden ? awayTeamLabel : homeTeamLabel;
  const [first] = group.conflicts;
  const isPlayer = group.playerId !== null;
  const what = isPlayer ? 'line' : 'value';
  const choice = { formAction, reconciliationId, groupKey: group.key };

  return (
    <div className="py-3 border-b border-gray-100 last:border-0">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-gray-700">
          {isPlayer ? conflictPlayerLabel(group.playerId as string, playerNames) : describeScoreConflict(first)}
        </span>
        <span className="text-xs text-gray-400">
          {decided ? 'Using' : 'Not settled · using'} {using}
          {!isPlayer && (
            <>
              :{' '}
              <span className="font-semibold text-gray-700">{fmt(overridden ? first.awayLog : first.homeLog)}</span>
            </>
          )}
        </span>
      </div>
      {group.conflicts.map((conflict) => (
        <div key={conflictKey(conflict)}>
          {isPlayer && <p className="text-xs text-gray-500 mt-2">{statLabel(conflict)}</p>}
          <ValuePair
            conflict={conflict}
            overridden={overridden}
            homeTeamLabel={homeTeamLabel}
            awayTeamLabel={awayTeamLabel}
          />
        </div>
      ))}
      {canOverride && (
        <div className="mt-2 flex items-center gap-2">
          {(!decided || overridden) && (
            <ChoiceForm
              {...choice}
              useAwayValue={false}
              label={`${overridden ? 'Use' : 'Keep'} ${homeTeamLabel} ${what}`}
            />
          )}
          {(!decided || !overridden) && (
            <ChoiceForm {...choice} useAwayValue label={`Use ${awayTeamLabel} ${what}`} />
          )}
          {error && <span className="text-xs text-red-600">{error}</span>}
        </div>
      )}
    </div>
  );
}

/**
 * Completed-game panel comparing the two scorekeepers' logs. Shows a green
 * agreement state when there are no conflicts, otherwise lists each
 * difference — one entry per line-score conflict and one per player — with the
 * home (canonical) and away values. The settler keeps the home value or
 * accepts the away one for each; the differences stay to settle until every
 * one has a choice.
 */
export function ReconciliationPanel({
  reconciliationId,
  conflicts,
  overrides,
  canOverride,
  homeTeamLabel,
  awayTeamLabel,
  playerNames,
}: ReconciliationPanelProps): JSX.Element {
  const awayKeys = awayValueConflictKeys(conflicts, overrides);
  const decidedKeys = settledConflictKeys(conflicts, overrides);
  const groups = groupConflictsForSettling(conflicts);
  const openCount = groups.filter((group) => !decidedKeys.has(group.key)).length;

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
            {conflicts.length} difference{conflicts.length === 1 ? '' : 's'} between the two logs
            {openCount > 0 ? `, ${openCount} still to settle` : ', all settled'}. The home value stands
            unless {canOverride ? 'you accept' : 'the home coach accepts'} the away value; a
            player&apos;s line is taken from one log as a whole.
          </p>
          <div>
            {groups.map((group) => (
              <ConflictGroupRow
                key={group.key}
                reconciliationId={reconciliationId}
                group={group}
                overridden={awayKeys.has(group.key)}
                decided={decidedKeys.has(group.key)}
                canOverride={canOverride}
                homeTeamLabel={homeTeamLabel}
                awayTeamLabel={awayTeamLabel}
                playerNames={playerNames}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
