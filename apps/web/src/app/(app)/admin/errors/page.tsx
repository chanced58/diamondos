import type { JSX } from 'react';
import { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { loadErrorLog, type JobHealth } from '@/lib/services/errors/load-error-log';
import { describeJobResult } from '@/lib/services/errors/job-result';

export const metadata: Metadata = { title: 'Errors — Platform Admin' };
export const dynamic = 'force-dynamic';

const SOURCES = ['web', 'web_client', 'mobile', 'edge', 'db'] as const;

type SearchParams = { source?: string | string[]; area?: string | string[] };

function firstParam(value: string | string[] | undefined): string | undefined {
  const single = Array.isArray(value) ? value[0] : value;
  return single ? single : undefined;
}

function formatTimestamp(iso: string | null): string {
  if (!iso) return '—';
  return `${new Date(iso).toISOString().replace('T', ' ').slice(0, 19)} UTC`;
}

function jobActivity(job: JobHealth): string {
  if (job.job !== 'pitch-count-calculator') return '';
  return `${job.calls24h} calls, ${job.failures24h} failed in 24h`;
}

function formatDetails(details: unknown): string {
  return JSON.stringify(details ?? {}, null, 2);
}

export default async function ErrorsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<JSX.Element> {
  const auth = createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) redirect('/login');

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const source = firstParam(searchParams.source);
  const area = firstParam(searchParams.area);
  const result = await loadErrorLog(db, user.id, { source, area });

  if (!result.ok && result.code === 'forbidden') redirect('/admin');
  if (!result.ok && result.code === 'invalid') redirect('/admin/errors');

  if (!result.ok) {
    return (
      <div className="p-8 max-w-6xl">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Errors</h1>
        <p className="text-red-700">{result.error}</p>
      </div>
    );
  }

  const { rows, countLast24h, areas, jobs } = result.data;

  return (
    <div className="p-8 max-w-6xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">
        Errors <span className="text-gray-500 font-normal text-lg">({countLast24h} in the last 24 hours)</span>
      </h1>
      <p className="text-gray-500 mb-6">The newest 200 errors from the last 7 days, from every surface.</p>

      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Jobs</h2>
      {jobs.length === 0 ? (
        <p className="text-gray-500 mb-8">Job health is unavailable.</p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto mb-8">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-200">
                <th className="px-4 py-2 font-medium">Job</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Last run</th>
                <th className="px-4 py-2 font-medium">Last result</th>
                <th className="px-4 py-2 font-medium">Last success</th>
                <th className="px-4 py-2 font-medium">Last 24h</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.job} className="border-b border-gray-100">
                  <td className="px-4 py-2 text-gray-900">{job.job}</td>
                  <td className="px-4 py-2 text-gray-700">{job.enabled ? 'On' : 'Off'}</td>
                  <td className="px-4 py-2 whitespace-nowrap text-gray-700">{formatTimestamp(job.lastRunAt)}</td>
                  <td className={`px-4 py-2 ${job.lastOk === false ? 'text-red-700' : 'text-gray-700'}`}>
                    {describeJobResult(job)}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap text-gray-700">{formatTimestamp(job.lastSuccessAt)}</td>
                  <td className="px-4 py-2 text-gray-700">{jobActivity(job) || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <form method="get" className="flex flex-wrap items-end gap-3 mb-6">
        <label className="text-sm text-gray-700">
          <span className="block mb-1">Source</span>
          <select
            name="source"
            defaultValue={source ?? ''}
            className="border border-gray-300 rounded-lg px-3 py-2 bg-white text-gray-900"
          >
            <option value="">All sources</option>
            {SOURCES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="text-sm text-gray-700">
          <span className="block mb-1">Area</span>
          <select
            name="area"
            defaultValue={area ?? ''}
            className="border border-gray-300 rounded-lg px-3 py-2 bg-white text-gray-900"
          >
            <option value="">All areas</option>
            {areas.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="bg-brand-700 text-white font-semibold px-4 py-2 rounded-lg hover:bg-brand-800 transition-colors"
        >
          Filter
        </button>
        {(source || area) && (
          <Link href="/admin/errors" className="text-sm text-brand-700 py-2">Clear</Link>
        )}
      </form>

      {rows.length === 0 ? (
        <p className="text-gray-500">No errors match.</p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-200">
                <th className="px-4 py-2 font-medium">When</th>
                <th className="px-4 py-2 font-medium">Source</th>
                <th className="px-4 py-2 font-medium">Area</th>
                <th className="px-4 py-2 font-medium">Message</th>
                <th className="px-4 py-2 font-medium">Version</th>
                <th className="px-4 py-2 font-medium">Details</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-gray-100 align-top">
                  <td className="px-4 py-2 whitespace-nowrap text-gray-700">
                    {formatTimestamp(row.occurredAt)}
                  </td>
                  <td className="px-4 py-2 text-gray-700">{row.source}</td>
                  <td className="px-4 py-2 text-gray-700">{row.area}</td>
                  <td className="px-4 py-2 text-gray-900 break-words max-w-md">{row.message}</td>
                  <td className="px-4 py-2 text-gray-500">{row.appVersion ?? '—'}</td>
                  <td className="px-4 py-2">
                    <details>
                      <summary className="cursor-pointer text-brand-700">Show</summary>
                      <dl className="mt-2 text-xs text-gray-700 space-y-0.5">
                        {row.userId && <div>User: {row.userId}</div>}
                        {row.teamId && <div>Team: {row.teamId}</div>}
                        {row.gameId && <div>Game: {row.gameId}</div>}
                        {row.deviceId && <div>Device: {row.deviceId}</div>}
                      </dl>
                      <pre className="mt-2 text-xs bg-gray-50 border border-gray-200 rounded p-2 overflow-x-auto max-w-md">
                        {formatDetails(row.details)}
                      </pre>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
