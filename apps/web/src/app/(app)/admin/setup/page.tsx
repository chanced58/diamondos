'use client';

import type { JSX } from 'react';
import { useState } from 'react';
import { runSetupAction, runResetAction, runVerifyCleanAction } from './actions';

type SetupResult = {
  success: boolean;
  steps: string[];
  errors: string[];
};

function ResultDisplay({ result, label }: { result: SetupResult; label: string }) {
  return (
    <div className="mt-6 space-y-4">
      <div className={`rounded-lg px-4 py-3 text-sm font-medium ${
        result.success
          ? 'bg-green-50 text-green-800 border border-green-200'
          : 'bg-red-50 text-red-800 border border-red-200'
      }`}>
        {result.success ? `${label} completed successfully.` : `${label} completed with errors.`}
      </div>

      {result.steps.length > 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Steps</p>
          <ul className="text-sm text-gray-700 space-y-1">
            {result.steps.map((step, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-green-600 shrink-0">✓</span>
                <span>{step}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.errors.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-xs font-semibold text-red-500 uppercase tracking-wide mb-2">Errors</p>
          <ul className="text-sm text-red-700 space-y-1">
            {result.errors.map((err, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-red-500 shrink-0">✗</span>
                <span>{err}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function SetupPage(): JSX.Element {
  const [result, setResult] = useState<SetupResult | null>(null);
  const [running, setRunning] = useState(false);

  const [resetResult, setResetResult] = useState<SetupResult | null>(null);
  const [resetting, setResetting] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  const [verifyResult, setVerifyResult] = useState<SetupResult | null>(null);
  const [verifying, setVerifying] = useState(false);

  async function handleRun() {
    setRunning(true);
    try {
      const res = await runSetupAction();
      setResult(res);
    } catch (err) {
      setResult({ success: false, steps: [], errors: [err instanceof Error ? err.message : 'Unknown error'] });
    } finally {
      setRunning(false);
    }
  }

  async function handleVerify() {
    setVerifying(true);
    try {
      const res = await runVerifyCleanAction();
      setVerifyResult(res);
    } catch (err) {
      setVerifyResult({ success: false, steps: [], errors: [err instanceof Error ? err.message : 'Unknown error'] });
    } finally {
      setVerifying(false);
    }
  }

  async function handleReset() {
    setResetting(true);
    try {
      const res = await runResetAction();
      setResetResult(res);
    } catch (err) {
      setResetResult({ success: false, steps: [], errors: [err instanceof Error ? err.message : 'Unknown error'] });
    } finally {
      setResetting(false);
      setConfirmText('');
    }
  }

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Platform Setup</h1>
      <p className="text-gray-500 mb-6">
        One-time bootstrap to create the platform admin account and fix any missing data.
      </p>

      <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
        <h2 className="font-semibold text-gray-900 mb-3">This will:</h2>
        <ul className="text-sm text-gray-600 space-y-2 list-disc pl-5">
          <li>Ensure your account has a proper <code>user_profiles</code> row with email</li>
          <li>Ensure you are added as <strong>head_coach</strong> to any team you created</li>
          <li>Create <strong>chance@diamondos.app</strong> as the platform admin account</li>
          <li>Backfill any missing <code>user_profiles</code> rows for existing auth users</li>
        </ul>
      </div>

      <button
        onClick={handleRun}
        disabled={running}
        className="bg-brand-700 text-white font-semibold px-6 py-3 rounded-lg hover:bg-brand-800 disabled:opacity-50 transition-colors"
      >
        {running ? 'Running setup…' : 'Run Setup'}
      </button>

      {result && <ResultDisplay result={result} label="Setup" />}

      {/* ── Verify Clean ─────────────────────────────────────────── */}
      <div className="mt-8">
        <h2 className="text-base font-semibold text-gray-900 mb-1">Verify Clean State</h2>
        <p className="text-sm text-gray-500 mb-3">
          Checks all tables for any remaining trace of cdital5@gmail.com or unexpected data.
        </p>
        <button
          onClick={handleVerify}
          disabled={verifying}
          className="bg-gray-700 text-white font-semibold px-5 py-2.5 rounded-lg hover:bg-gray-800 disabled:opacity-50 transition-colors text-sm"
        >
          {verifying ? 'Checking…' : 'Run Verification'}
        </button>
        {verifyResult && <ResultDisplay result={verifyResult} label="Verification" />}
      </div>

      {/* ── Danger Zone ──────────────────────────────────────────── */}
      <section className="mt-12 border border-red-200 rounded-xl p-6 bg-red-50">
        <h2 className="text-lg font-semibold text-red-700 mb-1">Danger Zone — Platform Reset</h2>
        <p className="text-sm text-red-600 mb-3">
          Permanently deletes all teams and removes <strong>cdital5@gmail.com</strong> from the
          platform. <strong>chance@diamondos.app</strong> is kept. This cannot be undone.
        </p>
        <ul className="text-xs text-red-600 list-disc pl-5 mb-4 space-y-1">
          <li>All teams, players, games, game events, and stats</li>
          <li>All messages, channels, practices, and invitations</li>
          <li>cdital5@gmail.com account and profile</li>
        </ul>
        <input
          type="text"
          placeholder='Type "RESET" to confirm'
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          className="border border-red-300 rounded-lg px-3 py-2 text-sm mb-3 w-full bg-white"
        />
        <button
          onClick={handleReset}
          disabled={resetting || confirmText !== 'RESET'}
          className="bg-red-600 text-white font-semibold px-6 py-2.5 rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {resetting ? 'Resetting…' : 'Delete Everything & Reset'}
        </button>

        {resetResult && <ResultDisplay result={resetResult} label="Reset" />}

        {resetResult?.success && (
          <p className="text-sm text-gray-600 mt-4">
            Done. Go to <strong>Team Management</strong> to create a new team as{' '}
            <strong>chance@diamondos.app</strong>.
          </p>
        )}
      </section>
    </div>
  );
}
