'use client';

import type { JSX } from 'react';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { parseName, type HistoricalCategory, type ReconcileDecision, type SubjectTeam } from '@baseball/shared';
import type { ImportBatchRow } from '@baseball/database';
import { Button, Card } from '@/components/ui';
import {
  analyzeImportAction,
  commitImportAction,
  rollbackImportAction,
  type AnalyzeResult,
  type CommitResult,
  type PlayerMatchPreview,
} from './actions';

type Team = { id: string; name: string };
type OpponentTeam = { id: string; name: string; is_historical: boolean };

type Props = {
  leagueId: string;
  teams: Team[];
  opponentTeams: OpponentTeam[];
  batches: ImportBatchRow[];
};

type Step = 'upload' | 'mapping' | 'reconcile' | 'review' | 'results';

const CATEGORY_LABELS: Record<HistoricalCategory, string> = {
  rosters: 'Rosters & players',
  player_stats: 'Player stats',
  team_stats: 'Team stats',
};

type SubjectChoice =
  | { kind: 'team'; teamId: string }
  | { kind: 'opponent'; opponentTeamId: string }
  | { kind: 'new_historical'; name: string; abbreviation: string };

export function ImportWizardClient({ leagueId, teams, opponentTeams, batches }: Props): JSX.Element {
  const router = useRouter();
  const [step, setStep] = useState<Step>('upload');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [files, setFiles] = useState<FileList | null>(null);
  const [analysis, setAnalysis] = useState<AnalyzeResult | null>(null);

  const [included, setIncluded] = useState<Set<HistoricalCategory>>(new Set());
  const [mapping, setMapping] = useState<Partial<Record<HistoricalCategory, Record<string, string>>>>({});
  const [seasonYear, setSeasonYear] = useState<string>('');
  const [seasonLabel, setSeasonLabel] = useState<string>('');

  const [subject, setSubject] = useState<SubjectChoice>(
    teams.length > 0 ? { kind: 'team', teamId: teams[0].id } : { kind: 'new_historical', name: '', abbreviation: '' },
  );

  const [decisions, setDecisions] = useState<Record<string, { action: 'match' | 'create' | 'skip'; playerId?: string }>>({});
  const [commitResult, setCommitResult] = useState<CommitResult | null>(null);

  // ── Phase A ────────────────────────────────────────────────────────────────
  async function runAnalyze(e: React.FormEvent) {
    e.preventDefault();
    if (!files || files.length === 0) {
      setError('Choose at least one CSV file.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set('leagueId', leagueId);
      fd.set('sourcePlatform', 'home_team');
      Array.from(files).forEach((f) => fd.append('files', f));
      const res = await analyzeImportAction(fd);
      if (!res.ok) {
        setError(res.message || res.code);
        return;
      }
      setAnalysis(res.data);
      setIncluded(new Set(res.data.detectedCategories));
      setMapping(res.data.proposedMapping);
      // Default reconciliation: auto-matches confirmed, the rest created.
      const initial: typeof decisions = {};
      for (const p of res.data.matchPreview) {
        if (!p.externalPlayerId) continue;
        if (p.suggestion && p.suggestion.classification === 'auto') {
          initial[p.externalPlayerId] = { action: 'match', playerId: p.suggestion.playerId };
        } else {
          initial[p.externalPlayerId] = { action: 'create' };
        }
      }
      setDecisions(initial);
      setStep('mapping');
    } catch (err) {
      console.error('analyze failed', err);
      setError('Could not analyze the file. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  function toggleCategory(cat: HistoricalCategory) {
    setIncluded((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }

  function setColumnField(cat: HistoricalCategory, column: string, field: string) {
    setMapping((prev) => {
      const catMap = { ...(prev[cat] ?? {}) };
      if (field === '') delete catMap[column];
      else catMap[column] = field;
      return { ...prev, [cat]: catMap };
    });
  }

  const needsReconcile = included.has('rosters') || included.has('player_stats');

  // ── Phase B ────────────────────────────────────────────────────────────────
  function buildSubjectTeam(): SubjectTeam {
    if (subject.kind === 'team') return { kind: 'team', teamId: subject.teamId };
    if (subject.kind === 'opponent') return { kind: 'opponent', opponentTeamId: subject.opponentTeamId };
    return { kind: 'new_historical', name: subject.name, abbreviation: subject.abbreviation || null };
  }

  function buildReconciliation(): ReconcileDecision[] {
    if (!analysis || !needsReconcile) return [];
    return analysis.matchPreview
      .filter((p) => p.externalPlayerId)
      .map((p) => {
        const d = decisions[p.externalPlayerId!] ?? { action: 'create' as const };
        if (d.action === 'match') {
          return { action: 'match', externalPlayerId: p.externalPlayerId, playerId: d.playerId };
        }
        if (d.action === 'skip') {
          return { action: 'skip', externalPlayerId: p.externalPlayerId };
        }
        const { first, last } = parseName(p.sourceName);
        return {
          action: 'create',
          externalPlayerId: p.externalPlayerId,
          firstName: first || undefined,
          lastName: last || p.sourceName,
          jerseyNumber: p.jerseyNumber,
        };
      });
  }

  async function runCommit() {
    if (!analysis) return;
    const yearNum = Number.parseInt(seasonYear, 10);
    if (!Number.isFinite(yearNum)) {
      setError('Enter a season year.');
      return;
    }
    if (subject.kind === 'new_historical' && !subject.name.trim()) {
      setError('Name the historical team.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const confirmedCategories = Array.from(included);
      const mappingForConfirmed: Partial<Record<HistoricalCategory, Record<string, string>>> = {};
      for (const c of confirmedCategories) mappingForConfirmed[c] = mapping[c] ?? {};

      const res = await commitImportAction({
        batchId: analysis.batchId,
        leagueId,
        confirmedCategories,
        mapping: mappingForConfirmed,
        reconciliation: buildReconciliation(),
        seasonContext: { seasonYear: yearNum, seasonLabel: seasonLabel || null },
        subjectTeam: buildSubjectTeam(),
      });
      if (!res.ok) {
        setError(res.message || res.code);
        if (res.meta?.result) setCommitResult(res.meta.result as CommitResult);
        return;
      }
      setCommitResult(res.data);
      setStep('results');
      router.refresh();
    } catch (err) {
      console.error('commit failed', err);
      setError('Could not commit the import. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function rollback(batchId: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await rollbackImportAction({ batchId, leagueId });
      if (!res.ok) setError(res.message || res.code);
      else router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Import Historical Data</h1>
          <p className="text-sm text-gray-500">
            Bring rosters and stats from another platform into this league.
          </p>
        </div>
        <Link href="/league/admin" className="text-sm text-blue-600 hover:underline">
          ← Back to admin
        </Link>
      </header>

      <Stepper step={step} />

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-3 py-2">
          {error}
        </div>
      )}

      {step === 'upload' && (
        <UploadStep
          busy={busy}
          onFiles={setFiles}
          onSubmit={runAnalyze}
        />
      )}

      {step === 'mapping' && analysis && (
        <MappingStep
          analysis={analysis}
          included={included}
          mapping={mapping}
          onToggle={toggleCategory}
          onSetField={setColumnField}
          seasonYear={seasonYear}
          seasonLabel={seasonLabel}
          onSeasonYear={setSeasonYear}
          onSeasonLabel={setSeasonLabel}
          teams={teams}
          opponentTeams={opponentTeams}
          subject={subject}
          onSubject={setSubject}
          onBack={() => setStep('upload')}
          onNext={() => setStep(needsReconcile ? 'reconcile' : 'review')}
        />
      )}

      {step === 'reconcile' && analysis && (
        <ReconcileStep
          preview={analysis.matchPreview}
          decisions={decisions}
          onDecision={(ext, d) => setDecisions((prev) => ({ ...prev, [ext]: d }))}
          onBack={() => setStep('mapping')}
          onNext={() => setStep('review')}
        />
      )}

      {step === 'review' && analysis && (
        <ReviewStep
          analysis={analysis}
          included={included}
          subjectLabel={subjectLabel(subject, teams, opponentTeams)}
          seasonYear={seasonYear}
          decisions={decisions}
          busy={busy}
          onBack={() => setStep(needsReconcile ? 'reconcile' : 'mapping')}
          onCommit={runCommit}
        />
      )}

      {step === 'results' && commitResult && (
        <ResultsStep
          result={commitResult}
          batchId={analysis?.batchId}
          onRollback={analysis ? () => rollback(analysis.batchId) : undefined}
          busy={busy}
        />
      )}

      <ImportHistoryTable batches={batches} onRollback={rollback} busy={busy} />
    </div>
  );
}

function subjectLabel(s: SubjectChoice, teams: Team[], opp: OpponentTeam[]): string {
  if (s.kind === 'team') return teams.find((t) => t.id === s.teamId)?.name ?? 'Selected team';
  if (s.kind === 'opponent') return opp.find((o) => o.id === s.opponentTeamId)?.name ?? 'Opponent team';
  return `${s.name || 'New historical team'} (new)`;
}

function Stepper({ step }: { step: Step }): JSX.Element {
  const steps: Step[] = ['upload', 'mapping', 'reconcile', 'review', 'results'];
  const labels: Record<Step, string> = {
    upload: 'Upload',
    mapping: 'Confirm',
    reconcile: 'Reconcile',
    review: 'Review',
    results: 'Done',
  };
  const idx = steps.indexOf(step);
  return (
    <ol className="flex gap-2 text-xs">
      {steps.map((s, i) => (
        <li
          key={s}
          className={[
            'px-3 py-1 rounded-full border',
            i === idx
              ? 'bg-blue-600 text-white border-blue-600'
              : i < idx
                ? 'bg-blue-50 text-blue-700 border-blue-200'
                : 'bg-gray-50 text-gray-400 border-gray-200',
          ].join(' ')}
        >
          {i + 1}. {labels[s]}
        </li>
      ))}
    </ol>
  );
}

function UploadStep({
  busy,
  onFiles,
  onSubmit,
}: {
  busy: boolean;
  onFiles: (f: FileList | null) => void;
  onSubmit: (e: React.FormEvent) => void;
}): JSX.Element {
  return (
    <Card>
      <form onSubmit={onSubmit} className="p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Source platform</label>
          <select disabled className="text-sm border border-gray-300 rounded-lg px-3 py-2 bg-gray-50">
            <option>Home Team (GameChanger)</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">CSV file(s)</label>
          <input
            type="file"
            accept=".csv,.xml,text/csv"
            multiple
            onChange={(e) => onFiles(e.target.files)}
            className="block w-full text-sm"
          />
          <p className="text-xs text-gray-500 mt-1">
            Export your roster and stats from Home Team as CSV, then upload here.
          </p>
        </div>
        <Button type="submit" disabled={busy}>
          {busy ? 'Analyzing…' : 'Analyze file'}
        </Button>
      </form>
    </Card>
  );
}

function MappingStep(props: {
  analysis: AnalyzeResult;
  included: Set<HistoricalCategory>;
  mapping: Partial<Record<HistoricalCategory, Record<string, string>>>;
  onToggle: (c: HistoricalCategory) => void;
  onSetField: (c: HistoricalCategory, col: string, field: string) => void;
  seasonYear: string;
  seasonLabel: string;
  onSeasonYear: (v: string) => void;
  onSeasonLabel: (v: string) => void;
  teams: Team[];
  opponentTeams: OpponentTeam[];
  subject: SubjectChoice;
  onSubject: (s: SubjectChoice) => void;
  onBack: () => void;
  onNext: () => void;
}): JSX.Element {
  const { analysis, included, mapping } = props;
  return (
    <Card>
      <div className="p-6 space-y-6">
        <section className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Season year *</label>
            <input
              type="number"
              value={props.seasonYear}
              onChange={(e) => props.onSeasonYear(e.target.value)}
              placeholder="2024"
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Season label</label>
            <input
              value={props.seasonLabel}
              onChange={(e) => props.onSeasonLabel(e.target.value)}
              placeholder="2024 Spring"
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2"
            />
          </div>
        </section>

        <SubjectTeamPicker
          teams={props.teams}
          opponentTeams={props.opponentTeams}
          subject={props.subject}
          onSubject={props.onSubject}
        />

        {analysis.detectedCategories.map((cat) => (
          <section key={cat} className="border-t pt-4">
            <label className="flex items-center gap-2 font-medium">
              <input
                type="checkbox"
                checked={included.has(cat)}
                onChange={() => props.onToggle(cat)}
              />
              {CATEGORY_LABELS[cat]}
            </label>
            {included.has(cat) && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                {(analysis.columnsByCategory[cat] ?? []).map((col) => (
                  <div key={col} className="flex items-center gap-2 text-sm">
                    <span className="w-28 truncate text-gray-600" title={col}>
                      {col}
                    </span>
                    <span className="text-gray-400">→</span>
                    <select
                      value={mapping[cat]?.[col] ?? ''}
                      onChange={(e) => props.onSetField(cat, col, e.target.value)}
                      className="flex-1 border border-gray-300 rounded px-2 py-1"
                    >
                      <option value="">— ignore —</option>
                      {(analysis.fieldOptions[cat] ?? []).map((f) => (
                        <option key={f} value={f}>
                          {f}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            )}
          </section>
        ))}

        <div className="flex justify-between pt-2">
          <Button variant="ghost" onClick={props.onBack}>
            Back
          </Button>
          <Button onClick={props.onNext} disabled={included.size === 0}>
            Continue
          </Button>
        </div>
      </div>
    </Card>
  );
}

function SubjectTeamPicker(props: {
  teams: Team[];
  opponentTeams: OpponentTeam[];
  subject: SubjectChoice;
  onSubject: (s: SubjectChoice) => void;
}): JSX.Element {
  const { subject } = props;
  return (
    <section className="space-y-2">
      <label className="block text-sm font-medium">This import is for…</label>
      <div className="flex flex-wrap gap-3 text-sm">
        <label className="flex items-center gap-1">
          <input
            type="radio"
            checked={subject.kind === 'team'}
            onChange={() => props.onSubject({ kind: 'team', teamId: props.teams[0]?.id ?? '' })}
            disabled={props.teams.length === 0}
          />
          A current team
        </label>
        <label className="flex items-center gap-1">
          <input
            type="radio"
            checked={subject.kind === 'opponent'}
            onChange={() =>
              props.onSubject({ kind: 'opponent', opponentTeamId: props.opponentTeams[0]?.id ?? '' })
            }
            disabled={props.opponentTeams.length === 0}
          />
          An existing historical team
        </label>
        <label className="flex items-center gap-1">
          <input
            type="radio"
            checked={subject.kind === 'new_historical'}
            onChange={() => props.onSubject({ kind: 'new_historical', name: '', abbreviation: '' })}
          />
          A new historical team
        </label>
      </div>

      {subject.kind === 'team' && (
        <select
          value={subject.teamId}
          onChange={(e) => props.onSubject({ kind: 'team', teamId: e.target.value })}
          className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2"
        >
          {props.teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      )}
      {subject.kind === 'opponent' && (
        <select
          value={subject.opponentTeamId}
          onChange={(e) => props.onSubject({ kind: 'opponent', opponentTeamId: e.target.value })}
          className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2"
        >
          {props.opponentTeams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      )}
      {subject.kind === 'new_historical' && (
        <div className="grid grid-cols-2 gap-2">
          <input
            value={subject.name}
            onChange={(e) => props.onSubject({ ...subject, name: e.target.value })}
            placeholder="Team name"
            className="text-sm border border-gray-300 rounded-lg px-3 py-2"
          />
          <input
            value={subject.abbreviation}
            onChange={(e) => props.onSubject({ ...subject, abbreviation: e.target.value })}
            placeholder="Abbrev (optional)"
            className="text-sm border border-gray-300 rounded-lg px-3 py-2"
          />
        </div>
      )}
    </section>
  );
}

function ReconcileStep(props: {
  preview: PlayerMatchPreview[];
  decisions: Record<string, { action: 'match' | 'create' | 'skip'; playerId?: string }>;
  onDecision: (ext: string, d: { action: 'match' | 'create' | 'skip'; playerId?: string }) => void;
  onBack: () => void;
  onNext: () => void;
}): JSX.Element {
  return (
    <Card>
      <div className="p-6 space-y-4">
        <h2 className="font-medium">Reconcile players ({props.preview.length})</h2>
        <p className="text-sm text-gray-500">
          Confirm matches to existing league players, or create new ones.
        </p>
        <div className="divide-y">
          {props.preview.map((p) => {
            const ext = p.externalPlayerId!;
            const d = props.decisions[ext] ?? { action: 'create' as const };
            return (
              <div key={ext} className="py-2 flex items-center justify-between gap-3 text-sm">
                <div>
                  <div className="font-medium">
                    {p.sourceName}
                    {p.jerseyNumber != null && <span className="text-gray-400"> #{p.jerseyNumber}</span>}
                  </div>
                  {p.suggestion ? (
                    <div className="text-xs text-gray-500">
                      Suggested: {p.suggestion.playerName} ({Math.round(p.suggestion.score * 100)}% ·{' '}
                      {p.suggestion.reasons.join(', ')})
                    </div>
                  ) : (
                    <div className="text-xs text-gray-400">No existing match</div>
                  )}
                </div>
                <select
                  value={d.action}
                  onChange={(e) => {
                    const action = e.target.value as 'match' | 'create' | 'skip';
                    props.onDecision(ext, {
                      action,
                      playerId: action === 'match' ? p.suggestion?.playerId : undefined,
                    });
                  }}
                  className="border border-gray-300 rounded px-2 py-1"
                >
                  {p.suggestion && <option value="match">Match existing</option>}
                  <option value="create">Create new</option>
                  <option value="skip">Skip</option>
                </select>
              </div>
            );
          })}
        </div>
        <div className="flex justify-between pt-2">
          <Button variant="ghost" onClick={props.onBack}>
            Back
          </Button>
          <Button onClick={props.onNext}>Continue</Button>
        </div>
      </div>
    </Card>
  );
}

function ReviewStep(props: {
  analysis: AnalyzeResult;
  included: Set<HistoricalCategory>;
  subjectLabel: string;
  seasonYear: string;
  decisions: Record<string, { action: 'match' | 'create' | 'skip' }>;
  busy: boolean;
  onBack: () => void;
  onCommit: () => void;
}): JSX.Element {
  const decisionCounts = Object.values(props.decisions).reduce(
    (acc, d) => {
      acc[d.action] = (acc[d.action] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );
  return (
    <Card>
      <div className="p-6 space-y-4">
        <h2 className="font-medium">Review</h2>
        <ul className="text-sm space-y-1">
          <li>
            <strong>Team:</strong> {props.subjectLabel}
          </li>
          <li>
            <strong>Season:</strong> {props.seasonYear || '—'}
          </li>
          <li>
            <strong>Categories:</strong>{' '}
            {Array.from(props.included).map((c) => CATEGORY_LABELS[c]).join(', ')}
          </li>
          <li>
            <strong>Players:</strong> {decisionCounts.match ?? 0} matched, {decisionCounts.create ?? 0}{' '}
            new, {decisionCounts.skip ?? 0} skipped
          </li>
        </ul>
        <p className="text-xs text-gray-500">
          Imported stats are stored separately and badged as imported; they will not change any
          live game data. You can undo this import afterward.
        </p>
        <div className="flex justify-between pt-2">
          <Button variant="ghost" onClick={props.onBack}>
            Back
          </Button>
          <Button onClick={props.onCommit} disabled={props.busy}>
            {props.busy ? 'Importing…' : 'Import'}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function ResultsStep(props: {
  result: CommitResult;
  batchId?: string;
  onRollback?: () => void;
  busy: boolean;
}): JSX.Element {
  const { result } = props;
  return (
    <Card>
      <div className="p-6 space-y-3">
        <h2 className="font-medium text-green-700">Import complete</h2>
        <ul className="text-sm space-y-1">
          {result.rosters && (
            <li>
              Players: {result.rosters.created} created, {result.rosters.matched} matched,{' '}
              {result.rosters.skipped} skipped
            </li>
          )}
          {result.playerStats && (
            <li>
              Player stat rows: {result.playerStats.inserted} imported ({result.playerStats.skipped}{' '}
              duplicates skipped)
            </li>
          )}
          {result.teamStats && <li>Team stat rows: {result.teamStats.inserted} imported</li>}
        </ul>
        <div className="flex gap-2 pt-2">
          <Link href="/league/admin/players">
            <Button variant="turf">View players</Button>
          </Link>
          {props.onRollback && (
            <Button variant="ghost" onClick={props.onRollback} disabled={props.busy}>
              Undo this import
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

function ImportHistoryTable({
  batches,
  onRollback,
  busy,
}: {
  batches: ImportBatchRow[];
  onRollback: (id: string) => void;
  busy: boolean;
}): JSX.Element | null {
  if (batches.length === 0) return null;
  return (
    <Card>
      <div className="p-6">
        <h2 className="font-medium mb-3">Import history</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500">
              <th className="py-1">File</th>
              <th>Status</th>
              <th>Date</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {batches.map((b) => (
              <tr key={b.id} className="border-t">
                <td className="py-1 truncate max-w-[200px]" title={b.file_name}>
                  {b.file_name}
                </td>
                <td>{b.status}</td>
                <td>{new Date(b.created_at).toLocaleDateString()}</td>
                <td className="text-right">
                  {b.status === 'completed' && (
                    <button
                      onClick={() => onRollback(b.id)}
                      disabled={busy}
                      className="text-red-600 hover:underline disabled:opacity-50"
                    >
                      Undo
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
